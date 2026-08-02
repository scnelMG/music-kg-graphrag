from __future__ import annotations

import json
import subprocess
import sys
from dataclasses import replace
from pathlib import Path
from typing import TYPE_CHECKING

from pipeline import graphrag_policy
from pipeline.graphrag_evaluator import evaluate_scenario
from pipeline.graphrag_suite import load_suite
from pipeline.query_oracles import canonical_hash
from pipeline.query_suite import decode_json

if TYPE_CHECKING:
    import pytest

    from pipeline.query_models import JsonValue

REPOSITORY_ROOT = Path(__file__).parents[2]
GOLDEN_SUITE = REPOSITORY_ROOT / "data" / "evaluations" / "graphrag-golden.jsonl"
ADVERSARIAL_SUITE = REPOSITORY_ROOT / "data" / "evaluations" / "graphrag-adversarial.jsonl"


def _run_evaluator(suite: Path, output: Path) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [
            sys.executable,
            "-m",
            "pipeline.evaluate_graphrag",
            "--suite",
            str(suite),
            "--output",
            str(output),
        ],
        cwd=REPOSITORY_ROOT,
        check=False,
        capture_output=True,
        text=True,
    )


def test_golden_cli_verifies_evidence_bound_answers(tmp_path: Path) -> None:
    # Given: versioned supported questions and deterministic provider fixtures
    output = tmp_path / "golden.json"

    # When: the public evaluator CLI runs the golden suite
    completed = _run_evaluator(GOLDEN_SUITE, output)

    # Then: retrieval and generation pass with complete atomic mappings
    assert completed.returncode == 0, completed.stderr
    report = decode_json(output.read_text(encoding="utf-8"))
    assert isinstance(report, dict)
    assert report["status"] == "PASSED"
    release_gate = report["release_gate"]
    metrics = report["metrics"]
    scenarios = report["scenarios"]
    assert isinstance(release_gate, dict)
    assert isinstance(metrics, dict)
    assert isinstance(scenarios, list)
    assert release_gate["passed"] is True
    assert metrics["retrieval_required_evidence_recall"] == "1.000000"
    assert metrics["generation_claim_evidence_coverage"] == "1.000000"
    for raw_scenario in scenarios:
        assert isinstance(raw_scenario, dict)
        answer = raw_scenario["answer"]
        assert isinstance(answer, dict)
        claims = answer["claims"]
        assert isinstance(claims, list)
        for raw_claim in claims:
            assert isinstance(raw_claim, dict)
            evidence_ids = raw_claim["evidence_ids"]
            assert isinstance(evidence_ids, list)
            assert evidence_ids


def test_adversarial_cli_fails_closed_without_injection_control(tmp_path: Path) -> None:
    # Given: attacks spanning every required verifier failure mode
    output = tmp_path / "adversarial.json"

    # When: the public evaluator CLI runs the adversarial suite
    completed = _run_evaluator(ADVERSARIAL_SUITE, output)

    # Then: every case becomes a deterministic non-answer using only allowlisted evidence
    assert completed.returncode == 2
    report = decode_json(output.read_text(encoding="utf-8"))
    assert isinstance(report, dict)
    assert report["status"] == "REJECTED"
    release_gate = report["release_gate"]
    scenarios = report["scenarios"]
    assert isinstance(release_gate, dict)
    assert isinstance(scenarios, list)
    assert release_gate["passed"] is False
    assert len(scenarios) == 19
    poisoned_answer = None
    poisoned_selected = None
    failure_codes: dict[str, str] = {}
    for raw_scenario in scenarios:
        assert isinstance(raw_scenario, dict)
        answer = raw_scenario["answer"]
        selected = raw_scenario["selected_evidence_ids"]
        allowed = raw_scenario["allowed_evidence_ids"]
        assert isinstance(answer, dict)
        assert isinstance(selected, list)
        assert isinstance(allowed, list)
        assert all(isinstance(item, str) for item in selected)
        assert all(isinstance(item, str) for item in allowed)
        assert answer["claims"] == []
        assert answer["status"] == "REFUSED"
        scenario_id = raw_scenario["scenario_id"]
        failure_code = raw_scenario["failure_code"]
        assert isinstance(scenario_id, str)
        assert isinstance(failure_code, str)
        failure_codes[scenario_id] = failure_code
        selected_ids = {item for item in selected if isinstance(item, str)}
        allowed_ids = {item for item in allowed if isinstance(item, str)}
        assert selected_ids.issubset(allowed_ids)
        if raw_scenario["scenario_id"] == "poisoned-review-instruction":
            poisoned_answer = answer
            poisoned_selected = selected
    assert poisoned_answer is not None
    assert poisoned_selected is not None
    assert poisoned_answer["refusal_reason"] == "POISONED_CONTEXT"
    assert poisoned_selected == ["evidence:review-context-001"]
    assert set(failure_codes.values()) == {
        "CANDIDATE_NOT_RETRIEVED",
        "CLAIM_LIMIT_EXCEEDED",
        "CONTRADICTION_UNACKNOWLEDGED",
        "COST_LIMIT_EXCEEDED",
        "FORBIDDEN_CLAIM",
        "GRAPH_SNAPSHOT_VERSION_MISMATCH",
        "INCORRECT_REFUSAL",
        "INVALID_JSON",
        "INVALID_OUTPUT_SCHEMA",
        "LATENCY_LIMIT_EXCEEDED",
        "METADATA_NONDETERMINISTIC",
        "MISSING_EVIDENCE_ID",
        "OUTPUT_SCHEMA_VERSION_MISMATCH",
        "POISONED_CONTEXT",
        "PROVIDER_CONFIG_VERSION_MISMATCH",
        "RETRIEVAL_POLICY_VERSION_MISMATCH",
        "SYSTEM_PROMPT_VERSION_MISMATCH",
        "TOKEN_LIMIT_EXCEEDED",
        "UNSUPPORTED_QUESTION_CLASS",
    }


def test_repeated_golden_runs_have_identical_semantic_report(tmp_path: Path) -> None:
    # Given: the same versioned suite in separate processes
    first_output = tmp_path / "first.json"
    second_output = tmp_path / "second.json"

    # When: evaluation runs twice
    first = _run_evaluator(GOLDEN_SUITE, first_output)
    second = _run_evaluator(GOLDEN_SUITE, second_output)

    # Then: the complete reports are byte-identical
    assert first.returncode == second.returncode == 0
    assert first_output.read_bytes() == second_output.read_bytes()


def test_retrieval_prunes_to_twelve_records_before_generation() -> None:
    # Given: a valid supported case with thirteen allowlisted retrieval records
    scenario = load_suite(GOLDEN_SUITE)[0]
    oversized = replace(scenario, retrieval=scenario.retrieval * 13)

    # When: deterministic retrieval selection applies the binding policy
    result = evaluate_scenario(oversized)

    # Then: generation sees at most twelve evidence records and still verifies
    assert result.passed is True
    assert len(result.selected_evidence_ids) == 12


def test_top_level_answer_cannot_bypass_atomic_claim_verification() -> None:
    # Given: forbidden answer text with no atomic claims
    scenario = load_suite(GOLDEN_SUITE)[0]
    provider = decode_json(scenario.provider_output_json)
    assert isinstance(provider, dict)
    provider["answer"] = "This is an invented genre assertion."
    provider["claims"] = []
    bypass = replace(scenario, provider_output_json=json.dumps(provider))

    # When: the deterministic verifier evaluates the output
    result = evaluate_scenario(bypass)

    # Then: top-level prose cannot bypass claim and forbidden-term checks
    assert result.passed is False
    assert str(result.failure_code) == "FORBIDDEN_CLAIM"


def test_candidate_claim_cannot_cite_another_candidates_evidence() -> None:
    # Given: two selected candidates and a claim citing the other candidate's record
    scenarios = load_suite(GOLDEN_SUITE)
    rationale = scenarios[2]
    other_evidence = scenarios[3].retrieval[0]
    provider = decode_json(rationale.provider_output_json)
    assert isinstance(provider, dict)
    claims = provider["claims"]
    assert isinstance(claims, list)
    claim = claims[0]
    assert isinstance(claim, dict)
    claim["evidence_ids"] = [other_evidence.evidence_id]
    bypass = replace(
        rationale,
        allowed_candidate_ids=("release-group:world-of-sleepers", "release-group:crumbling"),
        required_evidence_ids=(
            rationale.retrieval[0].evidence_id,
            other_evidence.evidence_id,
        ),
        retrieval=(rationale.retrieval[0], other_evidence),
        provider_output_json=json.dumps(provider),
    )

    # When: the deterministic verifier evaluates the cross-candidate citation
    result = evaluate_scenario(bypass)

    # Then: the cited record must itself support the claim candidate
    assert result.passed is False
    assert str(result.failure_code) == "CANDIDATE_NOT_RETRIEVED"


def test_actual_evidence_tokens_cannot_hide_behind_declared_hint() -> None:
    # Given: a 100-token hint paired with more than 3,500 actual evidence tokens
    scenario = load_suite(GOLDEN_SUITE)[0]
    evidence = scenario.retrieval[0]
    oversized_text = "word " * 3_501
    payload: dict[str, JsonValue] = {
        "candidate_ids": list(evidence.candidate_ids),
        "contradiction_key": evidence.contradiction_key,
        "contradiction_value": evidence.contradiction_value,
        "evidence_id": evidence.evidence_id,
        "path": list(evidence.path),
        "route": evidence.route,
        "source_id": evidence.source_id,
        "text": oversized_text,
    }
    oversized = replace(
        evidence,
        text=oversized_text,
        content_hash=canonical_hash(payload),
    )

    # When: the verifier computes the effective request size
    result = evaluate_scenario(replace(scenario, input_tokens=100, retrieval=(oversized,)))

    # Then: actual content exceeds the bound and fails closed
    assert result.passed is False
    assert str(result.failure_code) == "TOKEN_LIMIT_EXCEEDED"


def test_fixture_checksum_is_anchored_to_validated_fixture_content(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Given: a suite token that matches policy but an invalid current fixture manifest
    invalid_manifest = tmp_path / "manifest.json"
    _ = invalid_manifest.write_text('{"fixture_files":{}}', encoding="utf-8")
    monkeypatch.setattr(graphrag_policy, "FIXTURE_MANIFEST", invalid_manifest, raising=False)
    scenario = load_suite(GOLDEN_SUITE)[0]

    # When: the evaluator verifies fixture integrity
    result = evaluate_scenario(scenario)

    # Then: invalid current content is rejected independently of the declared token
    assert result.passed is False
    assert str(result.failure_code) == "FIXTURE_INTEGRITY_MISMATCH"


def test_refused_answer_cannot_contain_unsupported_factual_content() -> None:
    # Given: a correctly coded refusal carrying an unsupported factual answer
    scenario = load_suite(GOLDEN_SUITE)[4]
    provider = decode_json(scenario.provider_output_json)
    assert isinstance(provider, dict)
    provider["answer"] = "Crumbling is folktronica."
    bypass = replace(scenario, provider_output_json=json.dumps(provider))

    # When: the deterministic verifier evaluates the non-answer
    result = evaluate_scenario(bypass)

    # Then: refusals remain empty safe templates without source facts
    assert result.passed is False
    assert str(result.failure_code) == "INVALID_OUTPUT_SCHEMA"


def test_recomputed_item_hash_cannot_bless_mutated_evidence_content() -> None:
    # Given: approved evidence text is changed and its inner hash is recomputed
    scenario = load_suite(GOLDEN_SUITE)[0]
    evidence = scenario.retrieval[0]
    mutated_text = "Crumbling has genre invented-fixture-genre."
    payload: dict[str, JsonValue] = {
        "candidate_ids": list(evidence.candidate_ids),
        "contradiction_key": evidence.contradiction_key,
        "contradiction_value": evidence.contradiction_value,
        "evidence_id": evidence.evidence_id,
        "path": list(evidence.path),
        "route": evidence.route,
        "source_id": evidence.source_id,
        "text": mutated_text,
    }
    mutated = replace(
        evidence,
        text=mutated_text,
        content_hash=canonical_hash(payload),
    )

    # When: the evaluator verifies the recomputed record
    result = evaluate_scenario(replace(scenario, retrieval=(mutated,)))

    # Then: immutable evidence expectations reject the changed content
    assert result.passed is False
    assert str(result.failure_code) == "FIXTURE_INTEGRITY_MISMATCH"


def test_claim_text_requires_semantic_support_from_cited_evidence() -> None:
    # Given: a fabricated award claim citing genuine genre evidence for the right candidate
    scenario = load_suite(GOLDEN_SUITE)[0]
    provider = decode_json(scenario.provider_output_json)
    assert isinstance(provider, dict)
    claims = provider["claims"]
    assert isinstance(claims, list)
    claim = claims[0]
    assert isinstance(claim, dict)
    claim["text"] = "Crumbling won a Grammy in 2025."
    provider["answer"] = claim["text"]
    fabricated = replace(scenario, provider_output_json=json.dumps(provider))

    # When: identifiers match but cited content does not entail the assertion
    result = evaluate_scenario(fabricated)

    # Then: deterministic semantic verification rejects the unsupported claim
    assert result.passed is False
    assert str(result.failure_code) == "INVALID_OUTPUT_SCHEMA"


def test_invalid_cost_values_fail_closed_with_typed_results() -> None:
    # Given: negative, non-finite, and malformed cost values
    scenario = load_suite(GOLDEN_SUITE)[0]

    # When: each invalid cost reaches the evaluator boundary
    results = tuple(
        evaluate_scenario(replace(scenario, estimated_cost_usd=value))
        for value in ("-0.01", "NaN", "Infinity", "not-a-cost")
    )

    # Then: none bypasses the budget or escapes as a raw Decimal exception
    assert all(result.passed is False for result in results)
    assert all(str(result.failure_code) == "INVALID_OUTPUT_SCHEMA" for result in results)


def test_contradiction_metadata_is_covered_by_evidence_integrity() -> None:
    # Given: approved evidence with its contradiction semantics removed or changed
    scenario = load_suite(GOLDEN_SUITE)[3]
    original = scenario.retrieval[0]
    mutations = (
        replace(original, contradiction_key=None, contradiction_value=None),
        replace(original, contradiction_value="ambient"),
    )
    mutations = tuple(
        replace(
            mutation,
            content_hash=canonical_hash(
                {
                    "candidate_ids": list(mutation.candidate_ids),
                    "contradiction_key": mutation.contradiction_key,
                    "contradiction_value": mutation.contradiction_value,
                    "evidence_id": mutation.evidence_id,
                    "path": list(mutation.path),
                    "route": mutation.route,
                    "source_id": mutation.source_id,
                    "text": mutation.text,
                },
            ),
        )
        for mutation in mutations
    )

    # When: each mutation retains the otherwise approved evidence record
    results = tuple(
        evaluate_scenario(replace(scenario, retrieval=(mutation, scenario.retrieval[1])))
        for mutation in mutations
    )

    # Then: semantics-bearing contradiction metadata cannot evade the integrity gate
    assert all(result.passed is False for result in results)
    assert all(str(result.failure_code) == "FIXTURE_INTEGRITY_MISMATCH" for result in results)
