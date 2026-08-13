from __future__ import annotations

import hashlib
import json
import sys
from dataclasses import dataclass
from pathlib import Path
from time import perf_counter_ns
from typing import TYPE_CHECKING

from .graphrag_evaluator import evaluate_scenario
from .graphrag_models import FailureCode, GraphRagError, Scenario, ScenarioResult
from .graphrag_suite import load_suite

if TYPE_CHECKING:
    from collections.abc import Sequence

    from .query_models import JsonValue


CLI_ARGUMENT_COUNT = 6


@dataclass(frozen=True, slots=True)
class CliArguments:
    suite: Path
    iterations: int
    output: Path


@dataclass(frozen=True, slots=True)
class MeasuredResult:
    result: ScenarioResult
    latency_us: int


def _nearest_rank(samples: tuple[int, ...], percentile: int) -> int:
    if not samples:
        return 0
    rank = (len(samples) * percentile + 99) // 100
    return sorted(samples)[rank - 1]


def _ratio(numerator: int, denominator: int) -> str:
    return "1.000000" if denominator == 0 else f"{numerator / denominator:.6f}"


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
        or arguments[2] != "--iterations"
        or arguments[4] != "--output"
    ):
        raise GraphRagError(
            code=FailureCode.INVALID_JSON,
            scenario_id="cli",
            detail="--suite PATH --iterations POSITIVE_INTEGER --output PATH",
        )
    try:
        iterations = int(arguments[3])
    except ValueError as error:
        raise GraphRagError(
            code=FailureCode.INVALID_JSON,
            scenario_id="cli",
            detail="iterations",
        ) from error
    if iterations <= 0:
        raise GraphRagError(
            code=FailureCode.INVALID_JSON,
            scenario_id="cli",
            detail="iterations",
        )
    return CliArguments(Path(arguments[1]), iterations, Path(arguments[5]))


def _scenario_payload(
    scenario: Scenario,
    measurements: tuple[MeasuredResult, ...],
) -> dict[str, JsonValue]:
    results = tuple(item.result for item in measurements)
    samples = tuple(item.latency_us for item in measurements)
    return {
        "latency_p50_us": _nearest_rank(samples, 50),
        "latency_p95_us": _nearest_rank(samples, 95),
        "passed": all(result.passed for result in results),
        "sample_count": len(samples),
        "scenario_id": scenario.scenario_id,
    }


def _report_payload(
    suite_path: Path,
    iterations: int,
    scenarios: tuple[Scenario, ...],
    measurements: tuple[tuple[MeasuredResult, ...], ...],
) -> dict[str, JsonValue]:
    flattened = tuple(
        item for scenario_measurements in measurements for item in scenario_measurements
    )
    results = tuple(item.result for item in flattened)
    latency_samples = tuple(item.latency_us for item in flattened)
    retrieval_required = sum(result.retrieval_required for result in results)
    retrieval_matched = sum(result.retrieval_matched for result in results)
    claims = tuple(claim for result in results for claim in result.answer.claims)
    mapped_claims = sum(bool(claim.evidence_ids) for claim in claims)
    passed = bool(results) and all(result.passed for result in results)
    return {
        "contract_version": "graphrag-performance/1.0.0",
        "measurement": {
            "iterations": iterations,
            "sample_count": len(latency_samples),
            "scope": "DETERMINISTIC_VERIFIER_ONLY",
            "unit": "microseconds",
        },
        "metrics": {
            "verifier_latency_p50_us": _nearest_rank(latency_samples, 50),
            "verifier_latency_p95_us": _nearest_rank(latency_samples, 95),
        },
        "quality": {
            "generation_claim_evidence_coverage": _ratio(mapped_claims, len(claims)),
            "retrieval_required_evidence_recall": _ratio(retrieval_matched, retrieval_required),
            "scenario_pass_rate": _ratio(sum(result.passed for result in results), len(results)),
        },
        "scenarios": [
            _scenario_payload(scenario, scenario_measurements)
            for scenario, scenario_measurements in zip(scenarios, measurements, strict=True)
        ],
        "status": "PASSED" if passed else "REJECTED",
        "suite_sha256": f"sha256:{hashlib.sha256(suite_path.read_bytes()).hexdigest()}",
    }


def run(arguments: CliArguments) -> int:
    try:
        scenarios = load_suite(arguments.suite)
    except GraphRagError as error:
        _write_atomic(
            arguments.output,
            {
                "error": {
                    "code": str(error.code),
                    "detail": error.detail,
                    "scenario_id": error.scenario_id,
                },
                "status": "REJECTED",
            },
        )
        return 2
    measurements = tuple(
        tuple(
            MeasuredResult(
                result=evaluate_scenario(scenario),
                latency_us=(perf_counter_ns() - started_at_ns) // 1_000,
            )
            for _ in range(arguments.iterations)
            for started_at_ns in (perf_counter_ns(),)
        )
        for scenario in scenarios
    )
    payload = _report_payload(arguments.suite, arguments.iterations, scenarios, measurements)
    _write_atomic(arguments.output, payload)
    return 0 if payload["status"] == "PASSED" else 2


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
