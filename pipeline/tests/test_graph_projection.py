from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path
from typing import TYPE_CHECKING, Protocol, TypedDict

if TYPE_CHECKING:

    class ReportDecoder(Protocol):
        def __call__(self, value: str) -> ProjectionReport: ...

    decode_report: ReportDecoder
else:
    from json import loads as decode_report


class GraphSnapshot(TypedDict):
    graph: str
    sha256: str
    triple_count: int


class RebuildSnapshot(TypedDict):
    graphs: list[GraphSnapshot]
    repository_sha256: str
    triple_count: int


class EventResult(TypedDict):
    attempts: int
    backoff_seconds: list[int]
    event_id: str
    load_attempted: bool
    state: str


class ProjectionReport(TypedDict):
    repository_rebuilds: list[RebuildSnapshot]
    duplicate_events: list[str]
    events: list[EventResult]
    named_graph_artifact: str
    rebuilds_identical: bool
    replayable_event_ids: list[str]
    reset_scope: str
    status: str


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
VALID_MANIFEST = REPOSITORY_ROOT / "data" / "fixtures" / "manifest.json"
INVALID_MANIFEST = REPOSITORY_ROOT / "data" / "fixtures" / "invalid" / "projection-cases.json"


def _run_projection(manifest: Path, output: Path) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [
            sys.executable,
            "-m",
            "pipeline.project_graph",
            "--fixture",
            str(manifest),
            "--reset",
            "--output",
            str(output),
        ],
        cwd=REPOSITORY_ROOT,
        check=False,
        capture_output=True,
        text=True,
    )


def _report(path: Path) -> ProjectionReport:
    return decode_report(path.read_text(encoding="utf-8"))


def test_cli_rebuilds_same_generation_twice_and_duplicate_is_idempotent(
    tmp_path: Path,
) -> None:
    # Given
    output = tmp_path / "projection.json"

    # When
    completed = _run_projection(VALID_MANIFEST, output)

    # Then
    assert completed.returncode == 0
    report = _report(output)
    assert report["status"] == "SUCCEEDED"
    assert report["rebuilds_identical"] is True
    assert report["repository_rebuilds"][0] == report["repository_rebuilds"][1]
    assert report["reset_scope"] == "repository"
    assert report["duplicate_events"] == ["fixture-event-musicbrainz-001"]
    graph = report["repository_rebuilds"][0]["graphs"][0]
    assert graph["graph"] == (
        "https://w3id.org/music-kg-graphrag/graph/musicbrainz/generation/fixture-20260731"
    )
    assert graph["triple_count"] > 0
    assert Path(report["named_graph_artifact"]).is_file()


def test_cli_output_is_stable_across_full_resets(tmp_path: Path) -> None:
    # Given
    first_output = tmp_path / "first" / "projection.json"
    second_output = tmp_path / "second" / "projection.json"

    # When
    first = _run_projection(VALID_MANIFEST, first_output)
    second = _run_projection(VALID_MANIFEST, second_output)

    # Then
    assert first.returncode == second.returncode == 0
    first_report = _report(first_output)
    second_report = _report(second_output)
    assert first_report["repository_rebuilds"] == second_report["repository_rebuilds"]


def test_nonconforming_rdf_aborts_before_load_and_is_replayable(
    tmp_path: Path,
) -> None:
    # Given
    output = tmp_path / "invalid-projection.json"

    # When
    completed = _run_projection(INVALID_MANIFEST, output)

    # Then
    assert completed.returncode == 1
    report = _report(output)
    assert report["status"] == "TERMINAL_FAILED"
    assert report["duplicate_events"] == ["fixture-event-musicbrainz-001"]
    assert report["replayable_event_ids"] == ["fixture-event-invalid-001"]
    invalid = next(
        event for event in report["events"] if event["event_id"] == "fixture-event-invalid-001"
    )
    assert invalid["state"] == "TERMINAL_FAILED"
    assert invalid["load_attempted"] is False


def test_retryable_load_uses_bounded_backoff_before_success(tmp_path: Path) -> None:
    # Given
    output = tmp_path / "retry-projection.json"

    # When
    completed = _run_projection(INVALID_MANIFEST, output)

    # Then
    assert completed.returncode == 1
    retried = next(
        event
        for event in _report(output)["events"]
        if event["event_id"] == "fixture-event-retry-001"
    )
    assert retried["state"] == "SUCCEEDED"
    assert retried["attempts"] == 3
    assert retried["backoff_seconds"] == [1, 2]


def test_malformed_turtle_aborts_before_named_graph_artifact(tmp_path: Path) -> None:
    # Given
    malformed = tmp_path / "broken.ttl"
    _ = malformed.write_text(
        "@prefix music: <https://w3id.org/music-kg-graphrag/ontology#> . [",
        encoding="utf-8",
    )
    manifest = tmp_path / "manifest.json"
    _ = manifest.write_text(
        json.dumps(
            {
                "fixture_mode": True,
                "projection": {
                    "generation": "malformed-generation",
                    "events": [
                        {
                            "event_id": "malformed-event",
                            "source": "fixture",
                            "rdf_path": "broken.ttl",
                        },
                    ],
                },
            },
        ),
        encoding="utf-8",
    )
    output = tmp_path / "malformed.json"

    # When
    completed = _run_projection(manifest, output)

    # Then
    assert completed.returncode == 1
    report = _report(output)
    malformed_event = report["events"][0]
    assert malformed_event["state"] == "TERMINAL_FAILED"
    assert malformed_event["load_attempted"] is False
    assert not Path(report["named_graph_artifact"]).exists()
