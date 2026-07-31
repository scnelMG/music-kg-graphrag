from __future__ import annotations

import hashlib
import json
import sys
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import TYPE_CHECKING
from urllib.parse import urlsplit

from .graphdb_repository import GraphDbConfig, GraphDbRepository
from .projection_models import (
    JsonValue,
    ManifestCode,
    ProjectionManifestError,
    load_projection_manifest,
)
from .projection_store import (
    MAX_ATTEMPTS,
    EventOutcome,
    EventState,
    FixtureRepository,
    ProjectionRepository,
    RepositorySnapshot,
    RetryableRepositoryError,
    TerminalRepositoryError,
    project_event,
)

if TYPE_CHECKING:
    from collections.abc import Sequence

    from .projection_models import ProjectionEvent


_REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
_REPOSITORY_CONFIG = _REPOSITORY_ROOT / "deployment" / "graphdb" / "repository-config.ttl"
_SHAPES = _REPOSITORY_ROOT / "shapes" / "music-shapes.ttl"


@dataclass(frozen=True, slots=True)
class CliArguments:
    fixture: Path
    reset: bool
    output: Path
    replay_event: str | None
    graphdb_url: str | None
    max_attempts: int


def _parse_arguments(arguments: Sequence[str]) -> CliArguments:
    values: dict[str, str] = {}
    reset = False
    index = 0
    while index < len(arguments):
        flag = arguments[index]
        if flag == "--reset":
            reset = True
            index += 1
            continue
        if flag not in {
            "--fixture",
            "--output",
            "--replay-event",
            "--graphdb-url",
            "--max-attempts",
        }:
            raise ProjectionManifestError(ManifestCode.INVALID, flag)
        if index + 1 >= len(arguments):
            raise ProjectionManifestError(ManifestCode.INVALID, flag)
        values[flag] = arguments[index + 1]
        index += 2
    if "--fixture" not in values or "--output" not in values:
        raise ProjectionManifestError(
            ManifestCode.INVALID,
            "--fixture and --output are required",
        )
    graphdb_url = values.get("--graphdb-url")
    if graphdb_url is not None and urlsplit(graphdb_url).scheme not in {"http", "https"}:
        raise ProjectionManifestError(ManifestCode.INVALID, "--graphdb-url")
    try:
        max_attempts = int(values.get("--max-attempts", "3"))
    except ValueError as error:
        raise ProjectionManifestError(ManifestCode.INVALID, "--max-attempts") from error
    if not 1 <= max_attempts <= MAX_ATTEMPTS:
        raise ProjectionManifestError(ManifestCode.INVALID, "--max-attempts")
    return CliArguments(
        fixture=Path(values["--fixture"]),
        reset=reset,
        output=Path(values["--output"]),
        replay_event=values.get("--replay-event"),
        graphdb_url=graphdb_url,
        max_attempts=max_attempts,
    )


def _run_once(
    events: tuple[ProjectionEvent, ...],
    repository: ProjectionRepository,
    max_attempts: int,
) -> tuple[tuple[EventOutcome, ...], RepositorySnapshot]:
    outcomes = tuple(
        project_event(event, repository, max_attempts=max_attempts) for event in events
    )
    return outcomes, repository.snapshot()


def _sync_terminal_state(
    events: tuple[ProjectionEvent, ...],
    outcomes: tuple[EventOutcome, ...],
    repository: ProjectionRepository,
) -> None:
    try:
        for event, outcome in zip(events, outcomes, strict=True):
            match outcome.state:
                case EventState.SUCCEEDED:
                    repository.clear_terminal(event.event_id)
                case EventState.TERMINAL_FAILED:
                    repository.record_terminal(
                        event.event_id,
                        outcome.error_code or "PROJECTION_FAILED",
                    )
    except (RetryableRepositoryError, TerminalRepositoryError):
        return


def _snapshot_payload(snapshot: RepositorySnapshot) -> dict[str, JsonValue]:
    return {
        "graphs": [
            {
                "graph": graph.graph,
                "sha256": graph.sha256,
                "triple_count": graph.triple_count,
            }
            for graph in snapshot.graphs
        ],
        "repository_sha256": snapshot.repository_sha256,
        "triple_count": snapshot.triple_count,
    }


def _artifact_path(output: Path) -> Path:
    return output.with_suffix(".nq")


def _empty_snapshot() -> RepositorySnapshot:
    return FixtureRepository().snapshot()


def _reset_failure(
    events: tuple[ProjectionEvent, ...],
    error: RetryableRepositoryError | TerminalRepositoryError,
) -> tuple[EventOutcome, ...]:
    return tuple(
        EventOutcome(
            event_id=event.event_id,
            state=EventState.TERMINAL_FAILED,
            attempts=1,
            backoff_seconds=(),
            load_attempted=False,
            error_code=error.code,
            duplicate=False,
        )
        for event in events
    )


def _execute(
    events: tuple[ProjectionEvent, ...],
    repository: ProjectionRepository,
    *,
    reset: bool,
    max_attempts: int,
) -> tuple[tuple[EventOutcome, ...], list[RepositorySnapshot]]:
    rebuilds: list[RepositorySnapshot] = []
    try:
        if reset:
            repository.reset()
        outcomes, snapshot = _run_once(events, repository, max_attempts)
        _sync_terminal_state(events, outcomes, repository)
        rebuilds.append(snapshot)
        if reset:
            repository.reset()
            outcomes, snapshot = _run_once(events, repository, max_attempts)
            _sync_terminal_state(events, outcomes, repository)
            rebuilds.append(snapshot)
    except (RetryableRepositoryError, TerminalRepositoryError) as error:
        outcomes = _reset_failure(events, error)
        rebuilds.append(_empty_snapshot())
    return outcomes, rebuilds


def _write_result(
    arguments: CliArguments,
    repository: ProjectionRepository,
    outcomes: tuple[EventOutcome, ...],
    rebuilds: list[RepositorySnapshot],
) -> int:
    terminal = tuple(outcome for outcome in outcomes if outcome.state is EventState.TERMINAL_FAILED)
    artifact = _artifact_path(arguments.output)
    arguments.output.parent.mkdir(parents=True, exist_ok=True)
    nquads = repository.nquads()
    if nquads:
        _ = artifact.write_text(nquads, encoding="utf-8")
    elif artifact.exists():
        artifact.unlink()

    snapshots = [_snapshot_payload(snapshot) for snapshot in rebuilds]
    try:
        replayable_event_ids = repository.terminal_event_ids(
            tuple(outcome.event_id for outcome in outcomes),
        )
    except (RetryableRepositoryError, TerminalRepositoryError):
        replayable_event_ids = ()
    report = {
        "contract_version": "1.0.0",
        "status": "TERMINAL_FAILED" if terminal else "SUCCEEDED",
        "fixture_sha256": hashlib.sha256(arguments.fixture.read_bytes()).hexdigest(),
        "pre_load_validation": "REQUIRED",
        "repository_validation": "CHECKSUM_AND_TRIPLE_COUNT",
        "clean_rebuilds": snapshots,
        "repository_rebuilds": snapshots,
        "rebuilds_identical": len(snapshots) == 1 or snapshots[0] == snapshots[1],
        "reset_scope": "repository" if arguments.reset else "none",
        "events": [
            {
                **asdict(outcome),
                "state": str(outcome.state),
                "backoff_seconds": list(outcome.backoff_seconds),
            }
            for outcome in outcomes
        ],
        "duplicate_events": [outcome.event_id for outcome in outcomes if outcome.duplicate],
        "replayable_event_ids": list(replayable_event_ids),
        "named_graph_artifact": str(artifact.resolve()),
        "repository_mode": repository.mode,
        "network_calls": repository.network_calls,
    }
    _ = arguments.output.write_text(
        json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    if terminal:
        _ = sys.stderr.write(
            " ".join(outcome.error_code or "PROJECTION_FAILED" for outcome in terminal) + "\n",
        )
        return 1
    _ = sys.stdout.write("PROJECTION_SUCCEEDED\n")
    return 0


def _selected_events(
    arguments: CliArguments,
    *,
    durable_replayable: tuple[str, ...] | None = None,
) -> tuple[ProjectionEvent, ...]:
    manifest = load_projection_manifest(arguments.fixture)
    if arguments.replay_event is None:
        return manifest.events
    selected_events = tuple(
        event for event in manifest.events if event.event_id == arguments.replay_event
    )
    if not selected_events:
        raise ProjectionManifestError(
            ManifestCode.UNKNOWN_REPLAY_EVENT,
            arguments.replay_event,
        )
    if (
        durable_replayable is not None
        and arguments.replay_event not in durable_replayable
    ):
        raise ProjectionManifestError(
            ManifestCode.REPLAY_NOT_TERMINAL,
            arguments.replay_event,
        )
    return selected_events


def run(arguments: CliArguments) -> int:
    if arguments.graphdb_url is None:
        selected_events = _selected_events(arguments)
        repository: ProjectionRepository = FixtureRepository()
        outcomes, rebuilds = _execute(
            selected_events,
            repository,
            reset=arguments.reset,
            max_attempts=arguments.max_attempts,
        )
        return _write_result(arguments, repository, outcomes, rebuilds)

    config = GraphDbConfig(
        base_url=arguments.graphdb_url,
        repository_id="music-kg",
        repository_config=_REPOSITORY_CONFIG,
        shapes=_SHAPES,
    )
    with GraphDbRepository(config) as repository:
        durable_replayable = None
        if arguments.replay_event is not None:
            durable_replayable = repository.terminal_event_ids(
                (arguments.replay_event,),
            )
        selected_events = _selected_events(
            arguments,
            durable_replayable=durable_replayable,
        )
        outcomes, rebuilds = _execute(
            selected_events,
            repository,
            reset=arguments.reset,
            max_attempts=arguments.max_attempts,
        )
        return _write_result(arguments, repository, outcomes, rebuilds)


def main(arguments: Sequence[str] | None = None) -> int:
    selected = sys.argv[1:] if arguments is None else arguments
    try:
        return run(_parse_arguments(selected))
    except ProjectionManifestError as error:
        _ = sys.stderr.write(f"{error}\n")
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
