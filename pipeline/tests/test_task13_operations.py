from __future__ import annotations

import json
import subprocess
import sys
from typing import TYPE_CHECKING, Protocol

import pytest

if TYPE_CHECKING:
    from pathlib import Path

    from pipeline.audit_support import JsonValue

    class JsonDecoder(Protocol):
        def __call__(self, value: str) -> JsonValue: ...

    decode_json: JsonDecoder
else:
    decode_json = json.loads


def _run_module(
    module: str,
    *arguments: str,
) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, "-m", module, *arguments],
        check=False,
        capture_output=True,
        text=True,
    )


def _read_json(path: Path) -> dict[str, JsonValue]:
    loaded = decode_json(path.read_text(encoding="utf-8"))
    assert isinstance(loaded, dict)
    return loaded


def test_fixture_demo_records_deterministic_local_proof_and_external_blockers(
    tmp_path: Path,
) -> None:
    # Given
    first = tmp_path / "first.json"
    second = tmp_path / "second.json"

    # When
    first_run = _run_module("pipeline.run_fixture_demo", "--output", str(first))
    second_run = _run_module("pipeline.run_fixture_demo", "--output", str(second))

    # Then
    first_report = _read_json(first)
    second_report = _read_json(second)
    assert first_run.returncode == 3
    assert second_run.returncode == 3
    assert first_report["status"] == "BLOCKED"
    assert first_report["checksums"] == second_report["checksums"]
    assert first_report["external_gates"] == second_report["external_gates"]


def test_fixture_demo_recovers_one_interrupted_projection_without_duplicates(
    tmp_path: Path,
) -> None:
    # Given
    output = tmp_path / "interrupt.json"

    # When
    completed = _run_module(
        "pipeline.run_fixture_demo",
        "--inject-projector-interrupt",
        "--output",
        str(output),
    )

    # Then
    report = _read_json(output)
    recovery = report["projection_recovery"]
    assert completed.returncode == 3
    assert isinstance(recovery, dict)
    trace = recovery["event_trace"]
    assert isinstance(trace, list)
    assert trace[:2] == [
        {
            "action": "project",
            "attempt": 1,
            "event_id": "fixture-outbox-001",
            "outcome": "interrupted_after_write",
        },
        {
            "action": "retry",
            "attempt": 2,
            "event_id": "fixture-outbox-001",
            "outcome": "deduplicated_recovery",
        },
    ]
    assert trace[-1] == {
        "action": "project",
        "attempt": 43,
        "event_id": "fixture-outbox-042",
        "outcome": "projected",
    }
    assert len(trace) == 43
    assert all(isinstance(item, dict) and "triple" not in item for item in trace)
    event_ids: set[str] = set()
    for item in trace:
        assert isinstance(item, dict)
        event_id = item.get("event_id")
        assert isinstance(event_id, str)
        event_ids.add(event_id)
    assert event_ids == {f"fixture-outbox-{index:03d}" for index in range(1, 43)}
    assert {key: value for key, value in recovery.items() if key != "event_trace"} == {
        "duplicate_triples": 0,
        "injected_interrupts": 1,
        "outbox_events": 42,
        "processed_events": 42,
        "projector_attempts": 43,
        "recovered_projections": 1,
    }


def test_scope_audit_rejects_all_named_forbidden_scope_classes(tmp_path: Path) -> None:
    # Given
    source = tmp_path / "source"
    backend = source / "backend"
    backend.mkdir(parents=True)
    _ = (backend / "violations.py").write_text(
        "GENERAL_CHATBOT = True\nPREMATURE_VECTOR_SEARCH = True\nWORKER_IN_VERCEL = True\n",
        encoding="utf-8",
    )
    output = tmp_path / "scope.json"

    # When
    completed = _run_module(
        "pipeline.audit_scope",
        "--source",
        str(source),
        "--output",
        str(output),
    )

    # Then
    report = _read_json(output)
    assert completed.returncode == 2
    assert report["status"] == "FAIL"
    assert report["violations"] == [
        "GENERAL_CHATBOT",
        "PREMATURE_VECTOR_SEARCH",
        "WORKER_IN_VERCEL",
    ]


@pytest.mark.parametrize(
    ("module", "extra_arguments", "expected_code"),
    [
        ("pipeline.audit_plan_compliance", ("--fixture-missing",), "REQUIRED_PROOF_MISSING"),
        (
            "pipeline.audit_scope",
            ("--fixture", "forbidden-real-notion-write"),
            "SCOPE_GUARDRAIL_VIOLATION",
        ),
        (
            "pipeline.audit_release_gates",
            ("--fixture", "missing-restore-artifact"),
            "RELEASE_GATE_FAILED",
        ),
    ],
)
def test_audit_negative_fixtures_fail_with_machine_code(
    tmp_path: Path,
    module: str,
    extra_arguments: tuple[str, ...],
    expected_code: str,
) -> None:
    # Given
    output = tmp_path / f"{module.rsplit('.', maxsplit=1)[-1]}.json"
    common = (
        "--plan",
        "../.omo/plans/music-kg-evidence-graphrag.md",
        "--evidence-dir",
        str(tmp_path),
        "--source",
        "..",
    )

    # When
    completed = _run_module(module, *common, "--output", str(output), *extra_arguments)

    # Then
    report = _read_json(output)
    assert completed.returncode == 2
    assert report["status"] == "FAIL"
    assert report["code"] == expected_code


def test_plan_audit_rejects_blocked_task13_report(tmp_path: Path) -> None:
    # Given
    plan = tmp_path / "plan.md"
    _ = plan.write_text("13. Prove the end-to-end fixture service\n", encoding="utf-8")
    evidence = tmp_path / "evidence"
    evidence.mkdir()
    _ = (evidence / "task-13-music-kg-evidence-graphrag.md").write_text(
        '{"status":"BLOCKED"}\n',
        encoding="utf-8",
    )
    output = tmp_path / "plan-audit.json"

    # When
    completed = _run_module(
        "pipeline.audit_plan_compliance",
        "--plan",
        str(plan),
        "--evidence-dir",
        str(evidence),
        "--output",
        str(output),
    )

    # Then
    report = _read_json(output)
    assert completed.returncode == 3
    assert report["status"] == "BLOCKED"
    assert report["code"] == "REQUIRED_PROOF_MISSING"
