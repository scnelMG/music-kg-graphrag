from __future__ import annotations

import hashlib
import json
import sys
from dataclasses import dataclass
from decimal import Decimal
from pathlib import Path
from typing import TYPE_CHECKING

from .graphrag_evaluator import evaluate_scenario
from .graphrag_models import (
    Claim,
    FailureCode,
    GraphAnswer,
    GraphRagError,
    Scenario,
    ScenarioResult,
)
from .graphrag_policy import (
    MAX_CLAIMS,
    MAX_ESTIMATED_COST_USD,
    MAX_EVIDENCE_RECORDS,
    MAX_INPUT_TOKENS,
    MAX_LATENCY_MS,
    POLICY_VERSIONS,
)
from .graphrag_suite import load_suite

if TYPE_CHECKING:
    from collections.abc import Sequence

    from .query_models import JsonValue


CLI_ARGUMENT_COUNT = 4


@dataclass(frozen=True, slots=True)
class CliArguments:
    suite: Path
    output: Path


def _versions_payload() -> dict[str, JsonValue]:
    return {
        "graph_snapshot": POLICY_VERSIONS.graph_snapshot,
        "output_schema": POLICY_VERSIONS.output_schema,
        "provider_config": POLICY_VERSIONS.provider_config,
        "retrieval_policy": POLICY_VERSIONS.retrieval_policy,
        "system_prompt": POLICY_VERSIONS.system_prompt,
    }


def _claim_payload(claim: Claim) -> dict[str, JsonValue]:
    return {
        "candidate_id": claim.candidate_id,
        "claim_id": claim.claim_id,
        "evidence_ids": list(claim.evidence_ids),
        "text": claim.text,
        "uncertainty": claim.uncertainty,
    }


def _answer_payload(answer: GraphAnswer) -> dict[str, JsonValue]:
    return {
        "answer": answer.answer,
        "claims": [_claim_payload(claim) for claim in answer.claims],
        "metadata": {
            "graph_snapshot": answer.metadata.graph_snapshot,
            "output_schema": answer.metadata.output_schema,
            "provider_config": answer.metadata.provider_config,
            "retrieval_policy": answer.metadata.retrieval_policy,
            "system_prompt": answer.metadata.system_prompt,
        },
        "question_class": answer.question_class,
        "refusal_reason": answer.refusal_reason,
        "status": str(answer.status),
    }


def _scenario_payload(result: ScenarioResult) -> dict[str, JsonValue]:
    return {
        "allowed_evidence_ids": list(result.allowed_evidence_ids),
        "answer": _answer_payload(result.answer),
        "failure_code": str(result.failure_code) if result.failure_code is not None else None,
        "passed": result.passed,
        "retrieval_matched": result.retrieval_matched,
        "retrieval_required": result.retrieval_required,
        "scenario_id": result.scenario_id,
        "selected_evidence_ids": list(result.selected_evidence_ids),
    }


def _ratio(numerator: int, denominator: int) -> str:
    return "1.000000" if denominator == 0 else f"{numerator / denominator:.6f}"


def _report_payload(
    suite_path: Path,
    scenarios: tuple[Scenario, ...],
    results: tuple[ScenarioResult, ...],
) -> dict[str, JsonValue]:
    retrieval_required = sum(result.retrieval_required for result in results)
    retrieval_matched = sum(result.retrieval_matched for result in results)
    claims = tuple(claim for result in results for claim in result.answer.claims)
    mapped_claims = sum(bool(claim.evidence_ids) for claim in claims)
    passed = bool(results) and all(result.passed for result in results)
    p95_latency = max((scenario.latency_ms for scenario in scenarios), default=0)
    max_cost = max(
        (Decimal(scenario.estimated_cost_usd) for scenario in scenarios),
        default=Decimal("0.000000"),
    )
    return {
        "bounds": {
            "max_claims": MAX_CLAIMS,
            "max_estimated_cost_usd": MAX_ESTIMATED_COST_USD,
            "max_evidence_records": MAX_EVIDENCE_RECORDS,
            "max_input_tokens": MAX_INPUT_TOKENS,
            "max_latency_ms": MAX_LATENCY_MS,
        },
        "contract_version": "1.0.0",
        "metrics": {
            "estimated_cost_usd_max": f"{max_cost:.6f}",
            "generation_claim_evidence_coverage": _ratio(mapped_claims, len(claims)),
            "generated_response_latency_p95_ms": p95_latency,
            "retrieval_required_evidence_recall": _ratio(
                retrieval_matched,
                retrieval_required,
            ),
        },
        "release_gate": {
            "deterministic_verifier": True,
            "model_judge_used": False,
            "passed": passed,
            "thresholds": {
                "claim_evidence_coverage": "1.000000",
                "required_evidence_recall": "1.000000",
            },
        },
        "scenarios": [_scenario_payload(result) for result in results],
        "status": "PASSED" if passed else "REJECTED",
        "suite_sha256": f"sha256:{hashlib.sha256(suite_path.read_bytes()).hexdigest()}",
        "versions": _versions_payload(),
    }


def _suite_error_payload(path: Path, error: GraphRagError) -> dict[str, JsonValue]:
    return {
        "contract_version": "1.0.0",
        "error": {
            "code": str(error.code),
            "detail": error.detail,
            "scenario_id": error.scenario_id,
        },
        "release_gate": {
            "deterministic_verifier": True,
            "model_judge_used": False,
            "passed": False,
        },
        "scenarios": [],
        "status": "REJECTED",
        "suite": str(path),
        "versions": _versions_payload(),
    }


def _write_atomic(path: Path, payload: dict[str, JsonValue]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f".{path.name}.tmp")
    _ = temporary.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    _ = temporary.replace(path)


def _parse_arguments(arguments: Sequence[str]) -> CliArguments:
    if (
        len(arguments) != CLI_ARGUMENT_COUNT
        or arguments[0] != "--suite"
        or arguments[2] != "--output"
    ):
        raise GraphRagError(
            code=FailureCode.INVALID_JSON,
            scenario_id="cli",
            detail="--suite PATH --output PATH",
        )
    return CliArguments(suite=Path(arguments[1]), output=Path(arguments[3]))


def run(arguments: CliArguments) -> int:
    try:
        scenarios = load_suite(arguments.suite)
    except GraphRagError as error:
        _write_atomic(arguments.output, _suite_error_payload(arguments.suite, error))
        return 2
    results = tuple(evaluate_scenario(scenario) for scenario in scenarios)
    payload = _report_payload(arguments.suite, scenarios, results)
    _write_atomic(arguments.output, payload)
    return 0 if all(result.passed for result in results) else 2


def main(arguments: Sequence[str] | None = None) -> int:
    selected = sys.argv[1:] if arguments is None else arguments
    try:
        parsed = _parse_arguments(selected)
    except GraphRagError as error:
        _ = sys.stderr.write(f"{error}\n")
        return 2
    return run(parsed)


if __name__ == "__main__":
    raise SystemExit(main())
