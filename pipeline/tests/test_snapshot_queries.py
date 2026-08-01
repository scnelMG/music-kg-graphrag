from __future__ import annotations

import json
import subprocess
import sys
from dataclasses import replace
from pathlib import Path
from time import perf_counter

import pytest

import pipeline.snapshot_queries as snapshot_module
from pipeline.query_execution import execute_bounded_case
from pipeline.query_models import EvidenceRecord, JsonValue, QueryCode, QueryRequestError, SuiteCase
from pipeline.query_oracles import canonical_hash
from pipeline.query_suite import decode_json
from pipeline.query_templates import (
    GRAPH_SNAPSHOT_ID,
    MAX_HOPS,
    MAX_ROWS,
    RETRIEVAL_RUN_ID,
    SOURCE_ID,
    TEMPLATE_NAMES,
    TEMPLATE_VERSION,
    TIMEOUT_MS,
    template_for,
)
from pipeline.snapshot_queries import load_suite, parse_suite_line, snapshot_suite

REPOSITORY_ROOT = Path(__file__).parents[2]
GOLDEN_SUITE = REPOSITORY_ROOT / "queries" / "fixtures" / "golden.jsonl"
ADVERSARIAL_SUITE = REPOSITORY_ROOT / "queries" / "fixtures" / "adversarial.jsonl"


def test_current_query_route_is_fixed_template_only() -> None:
    # Given: the public query-template registry
    # When: its supported names are inspected
    # Then: exactly the seven planned routes are exposed
    assert TEMPLATE_NAMES == (
        "exact_album_facts",
        "candidate_identity",
        "review_contexts",
        "preference_paths",
        "similar_candidates",
        "already_reviewed_exclusions",
        "festival_prep",
    )


def test_every_template_is_bounded_and_has_fixture_oracle() -> None:
    # Given: every allowlisted template
    # When: its static contract and fixture are inspected
    # Then: every route has the required hard bounds and oracle
    cases = load_suite(GOLDEN_SUITE)
    assert len(cases) == len(TEMPLATE_NAMES)
    assert {case.template_name for case in cases} == set(TEMPLATE_NAMES)
    assert all(case.row_limit <= MAX_ROWS for case in cases)
    assert all(case.timeout_ms <= TIMEOUT_MS for case in cases)
    assert all(case.hops <= MAX_HOPS for case in cases)
    assert all(case.oracle_path.is_file() for case in cases)


def test_golden_suite_returns_stable_complete_evidence() -> None:
    # Given: one fixture oracle for every named template
    # When: the suite is snapshotted twice
    first = snapshot_suite(GOLDEN_SUITE)
    second = snapshot_suite(GOLDEN_SUITE)

    # Then: hashes and complete evidence identity remain stable
    assert first == second
    assert first.status == "PASSED"
    assert first.executed_query_count == 7
    assert len(first.results) == 7
    assert all(result.evidence_id.startswith("evidence:") for result in first.results)
    assert all(result.complete for result in first.results)
    assert all(result.query_hash.startswith("sha256:") for result in first.results)
    assert all(result.retrieved_hash.startswith("sha256:") for result in first.results)


def test_executed_template_rejects_forged_oracle_path(tmp_path: Path) -> None:
    # Given: a valid request whose oracle carries a forged but internally consistent path
    template = template_for("forged-oracle", "exact_album_facts")
    forged_path: list[JsonValue] = [
        "release-group:crumbling",
        "assertion:forged",
        "genre:malicious",
    ]
    hashed: dict[str, JsonValue] = {
        "binding_types": {"release_group": "release_group_id"},
        "complete": True,
        "evidence_id": "evidence:exact-album-facts-001",
        "graph_snapshot_id": GRAPH_SNAPSHOT_ID,
        "path": forged_path,
        "query_hash": template.query_hash,
        "retrieval_run_id": RETRIEVAL_RUN_ID,
        "score": "0.970000",
        "source_id": SOURCE_ID,
        "template_name": "exact_album_facts",
        "template_version": TEMPLATE_VERSION,
    }
    oracle = {
        "evidence_id": "evidence:exact-album-facts-001",
        "path": forged_path,
        "query_hash": template.query_hash,
        "retrieved_hash": canonical_hash(hashed),
        "score": "0.970000",
    }
    _ = (tmp_path / "forged.json").write_text(json.dumps(oracle), encoding="utf-8")
    raw_case = GOLDEN_SUITE.read_text(encoding="utf-8").splitlines()[0].replace(
        "snapshots/exact_album_facts.json",
        "forged.json",
    )
    suite = tmp_path / "forged-suite.jsonl"
    _ = suite.write_text(raw_case + "\n", encoding="utf-8")

    # When: the fixed template is snapshotted
    with pytest.raises(QueryRequestError) as caught:
        _ = snapshot_suite(suite)

    # Then: executed evidence disagrees with and rejects the forged oracle
    assert caught.value.code is QueryCode.FIXTURE_ORACLE_INVALID
    assert caught.value.executed is True


def test_executor_binds_allowlisted_snapshot_when_decoy_graph_exists() -> None:
    # Given: a dataset containing authorized evidence and an unauthorized decoy graph
    case = load_suite(GOLDEN_SUITE)[0]

    # When: the fixed exact-facts template is executed with trusted bindings
    result = execute_bounded_case(case)

    # Then: only the allowlisted named graph contributes evidence
    assert result.path == (
        "release-group:crumbling",
        "assertion:crumbling-genre-001",
        "genre:folktronica",
    )


def test_oracle_path_cannot_escape_suite_root() -> None:
    # Given: an otherwise valid request with a parent-directory oracle path
    raw_case = GOLDEN_SUITE.read_text(encoding="utf-8").splitlines()[0].replace(
        "snapshots/exact_album_facts.json",
        "../outside.json",
    )

    # When: the suite boundary parses the request
    with pytest.raises(QueryRequestError) as caught:
        _ = parse_suite_line(raw_case, GOLDEN_SUITE, 1)

    # Then: traversal is rejected before query execution
    assert caught.value.code is QueryCode.INVALID_SUITE
    assert caught.value.executed is False


def test_query_timeout_terminates_worker_without_partial_evidence() -> None:
    # Given: a valid template request with a one-millisecond execution budget
    case = replace(load_suite(GOLDEN_SUITE)[0], timeout_ms=1)

    # When: execution exceeds that wall-clock budget
    started = perf_counter()
    with pytest.raises(QueryRequestError) as caught:
        _ = execute_bounded_case(case)
    elapsed = perf_counter() - started

    # Then: the worker is terminated promptly and returns no partial evidence
    assert caught.value.code is QueryCode.QUERY_TIMEOUT
    assert caught.value.executed is True
    assert elapsed < 1.0


def test_adversarial_suite_never_invokes_query_executor(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Given: an executor sentinel that fails if any query invocation occurs
    def reject_invocation(_case: SuiteCase) -> EvidenceRecord:
        message = "adversarial validation invoked the query executor"
        raise AssertionError(message)

    monkeypatch.setattr(snapshot_module, "execute_bounded_case", reject_invocation)
    output = tmp_path / "adversarial-no-execution.json"

    # When: the full adversarial suite crosses the CLI service boundary
    exit_code = snapshot_module.run(
        snapshot_module.CliArguments(suite=ADVERSARIAL_SUITE, output=output),
    )

    # Then: validation rejects every request before the executor seam
    assert exit_code == 2
    payload: JsonValue = decode_json(output.read_text(encoding="utf-8"))
    assert isinstance(payload, dict)
    assert payload["executed_query_count"] == 0


@pytest.mark.parametrize(
    ("case_id", "code"),
    [
        ("unsupported-relation", QueryCode.UNSUPPORTED_RELATION),
        ("parameter-injection", QueryCode.UNSAFE_BINDING),
        ("unknown-entity", QueryCode.UNKNOWN_ENTITY),
        ("overhop", QueryCode.HOP_LIMIT_EXCEEDED),
        ("row-cap", QueryCode.ROW_LIMIT_EXCEEDED),
        ("timeout", QueryCode.TIMEOUT_LIMIT_EXCEEDED),
        ("raw-query", QueryCode.RAW_QUERY_FORBIDDEN),
        ("unknown-graph", QueryCode.UNKNOWN_GRAPH),
        ("unknown-source", QueryCode.UNKNOWN_SOURCE),
    ],
)
def test_adversarial_case_fails_closed_without_raw_execution(
    case_id: str,
    code: QueryCode,
) -> None:
    # Given: an adversarial typed-query request
    raw_case = next(
        raw for raw in ADVERSARIAL_SUITE.read_text(encoding="utf-8").splitlines()
        if f'"case_id":"{case_id}"' in raw
    )

    # When: the untrusted request crosses the parser boundary
    with pytest.raises(QueryRequestError) as caught:
        _ = parse_suite_line(raw_case, ADVERSARIAL_SUITE, 1)

    # Then: validation is typed and no query was executed
    assert caught.value.code is code
    assert caught.value.executed is False

def test_cli_writes_machine_readable_snapshot(tmp_path: Path) -> None:
    # Given: the golden suite and an output path
    output = tmp_path / "query-snapshot.json"

    # When: the real module CLI is invoked
    completed = subprocess.run(
        [
            sys.executable,
            "-m",
            "pipeline.snapshot_queries",
            "--suite",
            str(GOLDEN_SUITE),
            "--output",
            str(output),
        ],
        cwd=REPOSITORY_ROOT / "pipeline",
        check=False,
        capture_output=True,
        text=True,
    )

    # Then: it succeeds with a stable evidence artifact
    assert completed.returncode == 0, completed.stderr
    payload: JsonValue = decode_json(output.read_text(encoding="utf-8"))
    assert isinstance(payload, dict)
    assert payload["status"] == "PASSED"
    assert payload["executed_query_count"] == 7
    results = payload["results"]
    assert isinstance(results, list)
    assert len(results) == 7


def test_adversarial_cli_reports_typed_failures_without_execution(tmp_path: Path) -> None:
    # Given: a suite containing every rejected request class
    output = tmp_path / "query-failures.json"

    # When: the real module CLI validates it
    completed = subprocess.run(
        [
            sys.executable,
            "-m",
            "pipeline.snapshot_queries",
            "--suite",
            str(ADVERSARIAL_SUITE),
            "--output",
            str(output),
        ],
        cwd=REPOSITORY_ROOT / "pipeline",
        check=False,
        capture_output=True,
        text=True,
    )

    # Then: every case fails closed and the CLI never executes raw input
    assert completed.returncode == 2
    payload: JsonValue = decode_json(output.read_text(encoding="utf-8"))
    assert isinstance(payload, dict)
    assert payload["status"] == "REJECTED"
    assert payload["executed_query_count"] == 0
    errors = payload["errors"]
    assert isinstance(errors, list)
    assert len(errors) == 9
    assert all(isinstance(error, dict) and error.get("executed") is False for error in errors)


def test_template_files_are_select_only_and_statically_bounded() -> None:
    # Given: every immutable template file
    templates = (REPOSITORY_ROOT / "queries" / "templates").glob("*.rq")

    # When: the machine-consumed query shapes are inspected
    queries = tuple(path.read_text(encoding="utf-8").upper() for path in templates)

    # Then: each is bounded SELECT without remote service, updates, or expansion
    assert len(queries) == 7
    assert all("SELECT " in query for query in queries)
    assert all("LIMIT 100" in query for query in queries)
    assert all("SERVICE " not in query for query in queries)
    assert all("DESCRIBE " not in query for query in queries)
    assert all("INSERT " not in query and "DELETE " not in query for query in queries)
