from __future__ import annotations

import json
import socket
import subprocess
import sys
from pathlib import Path
from typing import TYPE_CHECKING, Protocol, TypedDict, cast

import pytest

from pipeline.graphdb_repository import GraphDbConfig, GraphDbRepository
from pipeline.projection_models import ProjectionEvent
from pipeline.projection_store import TerminalRepositoryError, load_graph_payload

from .graphdb_wire_support import RunningGraphDb

if TYPE_CHECKING:

    class EventPayload(TypedDict):
        duplicate: bool
        error_code: str | None
        event_id: str
        load_attempted: bool
        state: str

    class ProjectionPayload(TypedDict):
        repository_rebuilds: list[dict[str, str | int | list[dict[str, str | int]]]]
        duplicate_events: list[str]
        events: list[EventPayload]
        network_calls: int
        replayable_event_ids: list[str]
        repository_mode: str
        reset_scope: str
        status: str

    class ProjectionDecoder(Protocol):
        def __call__(self, value: str) -> ProjectionPayload: ...

    decode_projection: ProjectionDecoder
else:
    from json import loads as decode_projection


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
MANIFEST = REPOSITORY_ROOT / "data" / "fixtures" / "manifest.json"
REPOSITORY_CONFIG = (
    REPOSITORY_ROOT / "deployment" / "graphdb" / "repository-config.ttl"
)
VALID_RDF = REPOSITORY_ROOT / "data" / "fixtures" / "valid" / "music-graph.ttl"
DATA_GRAPH = (
    "https://w3id.org/music-kg-graphrag/graph/musicbrainz/generation/fixture-20260731"
)
RECEIPT_GRAPH_PREFIX = (
    "https://w3id.org/music-kg-graphrag/graph/projection-receipts/"
)
SHAPES_GRAPH = "http://rdf4j.org/schema/rdf4j#SHACLShapeGraph"
TERMINAL_RECEIPT_GRAPH = (
    "https://w3id.org/music-kg-graphrag/graph/projection-terminal-receipts/"
    "fixture-event-musicbrainz-001"
)


def _command(url: str, output: Path, *extra: str) -> list[str]:
    return _manifest_command(url, output, MANIFEST, *extra)


def _bootstrap_command(url: str) -> list[str]:
    return [
        sys.executable,
        "-m",
        "pipeline.graphdb_bootstrap",
        "--graphdb-url",
        url,
    ]


def _manifest_command(
    url: str,
    output: Path,
    manifest: Path,
    *extra: str,
) -> list[str]:
    return [
        sys.executable,
        "-m",
        "pipeline.project_graph",
        "--fixture",
        str(manifest),
        "--graphdb-url",
        url,
        "--output",
        str(output),
        *extra,
    ]


def _write_manifest(
    path: Path,
    *,
    generation: str,
    rdf_path: Path,
) -> Path:
    _ = path.write_text(
        json.dumps(
            {
                "fixture_mode": True,
                "projection": {
                    "generation": generation,
                    "events": [
                        {
                            "event_id": "fixture-event-musicbrainz-001",
                            "source": "musicbrainz",
                            "rdf_path": str(rdf_path),
                        },
                    ],
                },
            },
        ),
        encoding="utf-8",
    )
    return path


def test_cli_creates_shacl_repository_loads_and_reads_back_idempotently(
    tmp_path: Path,
) -> None:
    # Given
    output = tmp_path / "graphdb.json"

    # When
    with RunningGraphDb(REPOSITORY_CONFIG) as graphdb:
        completed = subprocess.run(
            _command(graphdb.url, output, "--reset"),
            cwd=REPOSITORY_ROOT,
            check=False,
            capture_output=True,
            text=True,
        )
        state = graphdb.state

    # Then
    assert completed.returncode == 0
    report = decode_projection(output.read_text(encoding="utf-8"))
    assert report["status"] == "SUCCEEDED"
    assert report["repository_mode"] == "graphdb"
    assert report["network_calls"] > 0
    assert report["repository_rebuilds"][0] == report["repository_rebuilds"][1]
    assert report["reset_scope"] == "repository"
    assert report["duplicate_events"] == ["fixture-event-musicbrainz-001"]
    assert state.repository_creations == 2
    assert ("POST", "/repositories/music-kg") in state.calls
    assert ("POST", "/repositories/music-kg/statements") in state.calls
    assert ("GET", "/repositories/music-kg/statements") in state.calls


def test_wire_accepts_graphdb_xsd_string_readback_normalization(
    tmp_path: Path,
) -> None:
    # Given
    normalized_rdf = tmp_path / "xsd-string.ttl"
    _ = normalized_rdf.write_text(
        VALID_RDF.read_text(encoding="utf-8").replace(
            'music:title "Crumbling"',
            'music:title "Crumbling"^^xsd:string',
        ),
        encoding="utf-8",
    )
    manifest = _write_manifest(
        tmp_path / "manifest.json",
        generation="xsd-string-normalization",
        rdf_path=normalized_rdf,
    )
    output = tmp_path / "report.json"

    # When
    with RunningGraphDb(REPOSITORY_CONFIG) as graphdb:
        completed = subprocess.run(
            _manifest_command(graphdb.url, output, manifest),
            cwd=REPOSITORY_ROOT,
            check=False,
            capture_output=True,
            text=True,
        )

    # Then
    report = decode_projection(output.read_text(encoding="utf-8"))
    assert completed.returncode == 0
    assert report["status"] == "SUCCEEDED"


def test_cli_fails_typed_when_graphdb_is_unavailable(tmp_path: Path) -> None:
    # Given
    output = tmp_path / "unavailable.json"
    with socket.socket() as unused:
        unused.bind(("127.0.0.1", 0))
        host, port = cast("tuple[str, int]", unused.getsockname())
    unavailable_url = f"http://{host}:{port}"

    # When
    completed = subprocess.run(
        _command(unavailable_url, output, "--max-attempts", "1"),
        cwd=REPOSITORY_ROOT,
        check=False,
        capture_output=True,
        text=True,
    )

    # Then
    assert completed.returncode == 1
    report = decode_projection(output.read_text(encoding="utf-8"))
    assert report["status"] == "TERMINAL_FAILED"
    assert report["repository_mode"] == "graphdb"
    assert report["network_calls"] > 0
    assert {event["error_code"] for event in report["events"]} == {
        "GRAPHDB_UNAVAILABLE",
    }
    assert all(event["load_attempted"] for event in report["events"])


def test_graphdb_rejection_is_terminal_and_corrected_event_can_replay(
    tmp_path: Path,
) -> None:
    # Given
    rejected_output = tmp_path / "rejected.json"
    replay_output = tmp_path / "replayed.json"

    # When
    with RunningGraphDb(REPOSITORY_CONFIG) as graphdb:
        graphdb.state.reject_data_load = True
        rejected = subprocess.run(
            _command(graphdb.url, rejected_output, "--max-attempts", "1"),
            cwd=REPOSITORY_ROOT,
            check=False,
            capture_output=True,
            text=True,
        )
        terminal_receipt = graphdb.state.graphs[TERMINAL_RECEIPT_GRAPH]
        graphdb.state.reject_data_load = False
        replayed = subprocess.run(
            _command(
                graphdb.url,
                replay_output,
                "--replay-event",
                "fixture-event-musicbrainz-001",
            ),
            cwd=REPOSITORY_ROOT,
            check=False,
            capture_output=True,
            text=True,
        )
        terminal_cleared = TERMINAL_RECEIPT_GRAPH not in graphdb.state.graphs

    # Then
    rejected_report = decode_projection(rejected_output.read_text(encoding="utf-8"))
    replayed_report = decode_projection(replay_output.read_text(encoding="utf-8"))
    assert rejected.returncode == 1
    assert rejected_report["status"] == "TERMINAL_FAILED"
    assert {event["error_code"] for event in rejected_report["events"]} == {
        "GRAPHDB_LOAD_REJECTED",
    }
    assert b"GRAPHDB_LOAD_REJECTED" in terminal_receipt
    assert rejected_report["replayable_event_ids"] == [
        "fixture-event-musicbrainz-001",
    ]
    assert replayed.returncode == 0
    assert replayed_report["status"] == "SUCCEEDED"
    assert replayed_report["events"][0]["event_id"] == "fixture-event-musicbrainz-001"
    assert replayed_report["events"][0]["error_code"] is None
    assert replayed_report["replayable_event_ids"] == []
    assert terminal_cleared is True


def test_wire_genuine_server_error_remains_retryable(tmp_path: Path) -> None:
    # Given
    output = tmp_path / "server-error.json"

    # When
    with RunningGraphDb(REPOSITORY_CONFIG) as graphdb:
        graphdb.state.fail_data_load_retryably = True
        completed = subprocess.run(
            _command(graphdb.url, output, "--max-attempts", "1"),
            cwd=REPOSITORY_ROOT,
            check=False,
            capture_output=True,
            text=True,
        )

    # Then
    report = decode_projection(output.read_text(encoding="utf-8"))
    assert completed.returncode == 1
    assert {event["error_code"] for event in report["events"]} == {
        "GRAPHDB_UNAVAILABLE",
    }


def test_wire_prepare_replay_reconciles_only_pending_terminal_receipt() -> None:
    # Given
    event_id = "canonical-replay-001"
    event = ProjectionEvent(
        event_id=event_id,
        source="postgresql",
        generation="7",
        rdf_path=VALID_RDF,
        fixture_retry_failures=0,
    )
    payload = load_graph_payload(str(VALID_RDF), event.graph_iri)

    # When
    with RunningGraphDb(REPOSITORY_CONFIG) as graphdb:
        config = GraphDbConfig(
            base_url=graphdb.url,
            repository_id="music-kg",
            repository_config=REPOSITORY_CONFIG,
            shapes=REPOSITORY_ROOT / "shapes" / "music-shapes.ttl",
        )
        with GraphDbRepository(config) as repository:
            graphdb.state.reject_data_load = True
            with pytest.raises(TerminalRepositoryError) as captured:
                _ = repository.apply(event, payload)
            assert captured.value.code == "GRAPHDB_LOAD_REJECTED"
            repository.record_terminal(event_id, "GRAPHDB_LOAD_REJECTED")
            graphdb.state.reject_data_load = False
            repository.prepare_replay(event_id)
            applied = repository.apply(event, payload)

    # Then
    assert applied is True


def test_wire_replay_refuses_event_without_durable_terminal_receipt(
    tmp_path: Path,
) -> None:
    # Given
    first_output = tmp_path / "first.json"
    replay_output = tmp_path / "replay.json"

    # When
    with RunningGraphDb(REPOSITORY_CONFIG) as graphdb:
        first = subprocess.run(
            _command(graphdb.url, first_output),
            cwd=REPOSITORY_ROOT,
            check=False,
            capture_output=True,
            text=True,
        )
        replay = subprocess.run(
            _command(
                graphdb.url,
                replay_output,
                "--replay-event",
                "fixture-event-musicbrainz-001",
            ),
            cwd=REPOSITORY_ROOT,
            check=False,
            capture_output=True,
            text=True,
        )
        result = {
            "evidence_kind": "wire_protocol_fake",
            "exit_code": replay.returncode,
            "output_absent": not replay_output.exists(),
            "stderr": replay.stderr.strip(),
        }
        _ = (tmp_path / "replay-refused-result.json").write_text(
            json.dumps(result, indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
        )

    # Then
    assert first.returncode == 0
    assert replay.returncode == 2
    assert "REPLAY_EVENT_NOT_TERMINAL" in replay.stderr
    assert not replay_output.exists()


def test_wire_receipt_rejects_same_event_id_for_new_generation(
    tmp_path: Path,
) -> None:
    # Given
    first_output = tmp_path / "first.json"
    conflict_output = tmp_path / "generation-conflict.json"
    conflict_replay_output = tmp_path / "generation-conflict-replay.json"
    corrected_replay_output = tmp_path / "corrected-replay.json"
    changed_manifest = _write_manifest(
        tmp_path / "changed-generation.json",
        generation="fixture-20260731-v2",
        rdf_path=VALID_RDF,
    )

    # When
    with RunningGraphDb(REPOSITORY_CONFIG) as graphdb:
        first = subprocess.run(
            _command(graphdb.url, first_output),
            cwd=REPOSITORY_ROOT,
            check=False,
            capture_output=True,
            text=True,
        )
        original = graphdb.state.graphs[DATA_GRAPH]
        conflict = subprocess.run(
            _manifest_command(graphdb.url, conflict_output, changed_manifest),
            cwd=REPOSITORY_ROOT,
            check=False,
            capture_output=True,
            text=True,
        )
        conflict_replay = subprocess.run(
            _manifest_command(
                graphdb.url,
                conflict_replay_output,
                changed_manifest,
                "--replay-event",
                "fixture-event-musicbrainz-001",
            ),
            cwd=REPOSITORY_ROOT,
            check=False,
            capture_output=True,
            text=True,
        )
        corrected_replay = subprocess.run(
            _command(
                graphdb.url,
                corrected_replay_output,
                "--replay-event",
                "fixture-event-musicbrainz-001",
            ),
            cwd=REPOSITORY_ROOT,
            check=False,
            capture_output=True,
            text=True,
        )
        state = graphdb.state

    # Then
    report = decode_projection(conflict_output.read_text(encoding="utf-8"))
    replay_report = decode_projection(
        conflict_replay_output.read_text(encoding="utf-8"),
    )
    corrected_report = decode_projection(
        corrected_replay_output.read_text(encoding="utf-8"),
    )
    receipt_graph = f"{RECEIPT_GRAPH_PREFIX}fixture-event-musicbrainz-001"
    wire_evidence = {
        "changed_graph_absent": (
            "https://w3id.org/music-kg-graphrag/graph/musicbrainz/generation/"
            "fixture-20260731-v2"
        )
        not in state.graphs,
        "evidence_kind": "wire_protocol_fake",
        "receipt_graph_present": receipt_graph in state.graphs,
        "terminal_receipt_cleared": TERMINAL_RECEIPT_GRAPH not in state.graphs,
        "target_graph_unchanged": state.graphs[DATA_GRAPH] == original,
    }
    _ = (tmp_path / "wire-protocol-state.json").write_text(
        json.dumps(wire_evidence, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    assert first.returncode == 0
    assert conflict.returncode == 1
    assert conflict_replay.returncode == 1
    assert corrected_replay.returncode == 0
    assert report["events"][0]["error_code"] == "EVENT_IDENTITY_CONFLICT"
    assert replay_report["events"][0]["error_code"] == "EVENT_IDENTITY_CONFLICT"
    assert report["replayable_event_ids"] == ["fixture-event-musicbrainz-001"]
    assert replay_report["replayable_event_ids"] == [
        "fixture-event-musicbrainz-001",
    ]
    assert corrected_report["replayable_event_ids"] == []
    assert report["events"][0]["event_id"] in report["replayable_event_ids"]
    assert wire_evidence == {
        "changed_graph_absent": True,
        "evidence_kind": "wire_protocol_fake",
        "receipt_graph_present": True,
        "terminal_receipt_cleared": True,
        "target_graph_unchanged": True,
    }


def test_wire_receipt_rejects_same_event_id_for_changed_payload(
    tmp_path: Path,
) -> None:
    # Given
    changed_rdf = tmp_path / "changed.ttl"
    _ = changed_rdf.write_text(
        VALID_RDF.read_text(encoding="utf-8").replace("Crumbling", "Changed"),
        encoding="utf-8",
    )
    changed_manifest = _write_manifest(
        tmp_path / "changed-payload.json",
        generation="fixture-20260731",
        rdf_path=changed_rdf,
    )
    first_output = tmp_path / "first.json"
    conflict_output = tmp_path / "payload-conflict.json"

    # When
    with RunningGraphDb(REPOSITORY_CONFIG) as graphdb:
        first = subprocess.run(
            _command(graphdb.url, first_output),
            cwd=REPOSITORY_ROOT,
            check=False,
            capture_output=True,
            text=True,
        )
        original = graphdb.state.graphs[DATA_GRAPH]
        conflict = subprocess.run(
            _manifest_command(graphdb.url, conflict_output, changed_manifest),
            cwd=REPOSITORY_ROOT,
            check=False,
            capture_output=True,
            text=True,
        )
        state = graphdb.state

    # Then
    report = decode_projection(conflict_output.read_text(encoding="utf-8"))
    assert first.returncode == 0
    assert conflict.returncode == 1
    assert report["events"][0]["error_code"] == "EVENT_IDENTITY_CONFLICT"
    assert state.graphs[DATA_GRAPH] == original


def test_bootstrap_rejects_retained_repository_with_shacl_disabled(
    tmp_path: Path,
) -> None:
    # Given
    disabled_config = tmp_path / "repository-disabled.ttl"
    _ = disabled_config.write_text(
        REPOSITORY_CONFIG.read_text(encoding="utf-8").replace(
            "validationEnabled true",
            "validationEnabled false",
        ),
        encoding="utf-8",
    )

    # When
    with RunningGraphDb(disabled_config) as graphdb:
        graphdb.state.repository_exists = True
        completed = subprocess.run(
            _bootstrap_command(graphdb.url),
            cwd=REPOSITORY_ROOT,
            check=False,
            capture_output=True,
            text=True,
        )
        result = {
            "evidence_kind": "wire_protocol_fake",
            "exit_code": completed.returncode,
            "shapes_graph_absent": SHAPES_GRAPH not in graphdb.state.graphs,
            "stderr": completed.stderr.strip(),
        }
        _ = (tmp_path / "bootstrap-disabled-result.json").write_text(
            json.dumps(result, indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
        )

    # Then
    assert result == {
        "evidence_kind": "wire_protocol_fake",
        "exit_code": 1,
        "shapes_graph_absent": True,
        "stderr": "GRAPHDB_SHACL_NOT_ENABLED",
    }


def test_bootstrap_rejects_incomplete_project_shapes_readback(
    tmp_path: Path,
) -> None:
    # Given / When
    with RunningGraphDb(REPOSITORY_CONFIG) as graphdb:
        graphdb.state.repository_exists = True
        graphdb.state.corrupt_shapes_readback = True
        completed = subprocess.run(
            _bootstrap_command(graphdb.url),
            cwd=REPOSITORY_ROOT,
            check=False,
            capture_output=True,
            text=True,
        )
        result = {
            "evidence_kind": "wire_protocol_fake",
            "exit_code": completed.returncode,
            "stderr": completed.stderr.strip(),
        }
        _ = (tmp_path / "bootstrap-shapes-result.json").write_text(
            json.dumps(result, indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
        )

    # Then
    assert result == {
        "evidence_kind": "wire_protocol_fake",
        "exit_code": 1,
        "stderr": "GRAPHDB_SHAPES_MISMATCH",
    }


def test_wire_cli_fails_when_shapes_readback_differs_from_project_shapes(
    tmp_path: Path,
) -> None:
    # Given
    output = tmp_path / "shape-mismatch.json"

    # When
    with RunningGraphDb(REPOSITORY_CONFIG) as graphdb:
        graphdb.state.corrupt_shapes_readback = True
        completed = subprocess.run(
            _command(graphdb.url, output, "--max-attempts", "1"),
            cwd=REPOSITORY_ROOT,
            check=False,
            capture_output=True,
            text=True,
        )

    # Then
    report = decode_projection(output.read_text(encoding="utf-8"))
    assert completed.returncode == 1
    assert report["events"][0]["error_code"] == "GRAPHDB_SHAPES_MISMATCH"
    assert DATA_GRAPH not in graphdb.state.graphs
