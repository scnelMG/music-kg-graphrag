from __future__ import annotations

import json
import sys
from dataclasses import asdict, dataclass
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import TYPE_CHECKING
from urllib.parse import urlsplit
from uuid import UUID

from .canonical_outbox import CanonicalOutboxStore, PsycopgDatabase, canonical_projection_event
from .graphdb_repository import GraphDbConfig, GraphDbRepository
from .projection_models import ManifestCode, ProjectionManifestError
from .projection_store import (
    EventState,
    RetryableRepositoryError,
    TerminalRepositoryError,
    project_event,
)

if TYPE_CHECKING:
    from collections.abc import Sequence


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
MAX_CANONICAL_ATTEMPTS = 3
MAX_EVENTS_PER_RUN = 100


@dataclass(frozen=True, slots=True)
class OutboxArguments:
    database_url: str
    graphdb_url: str
    output: Path
    max_events: int
    replay_event: UUID | None


def parse_arguments(arguments: Sequence[str]) -> OutboxArguments:
    values: dict[str, str] = {}
    index = 0
    while index < len(arguments):
        flag = arguments[index]
        if flag not in {
            "--database-url",
            "--graphdb-url",
            "--output",
            "--max-events",
            "--replay-event",
        } or index + 1 >= len(arguments):
            raise ProjectionManifestError(ManifestCode.INVALID, flag)
        values[flag] = arguments[index + 1]
        index += 2
    required = ("--database-url", "--graphdb-url", "--output")
    if any(flag not in values for flag in required):
        raise ProjectionManifestError(ManifestCode.INVALID, "canonical outbox arguments")
    if urlsplit(values["--database-url"]).scheme not in {"postgres", "postgresql"}:
        raise ProjectionManifestError(ManifestCode.INVALID, "--database-url")
    if urlsplit(values["--graphdb-url"]).scheme not in {"http", "https"}:
        raise ProjectionManifestError(ManifestCode.INVALID, "--graphdb-url")
    try:
        max_events = int(values.get("--max-events", "10"))
        replay_event = UUID(values["--replay-event"]) if "--replay-event" in values else None
    except ValueError as error:
        raise ProjectionManifestError(ManifestCode.INVALID, "canonical outbox arguments") from error
    if not 1 <= max_events <= MAX_EVENTS_PER_RUN:
        raise ProjectionManifestError(ManifestCode.INVALID, "--max-events")
    return OutboxArguments(
        database_url=values["--database-url"],
        graphdb_url=values["--graphdb-url"],
        output=Path(values["--output"]),
        max_events=max_events,
        replay_event=replay_event,
    )


def run(arguments: OutboxArguments) -> int:
    database = PsycopgDatabase(arguments.database_url)
    store = CanonicalOutboxStore(database)
    results: list[dict[str, str | int | bool | None]] = []
    try:
        if arguments.replay_event is not None and not store.replay_terminal(
            arguments.replay_event,
        ):
            raise ProjectionManifestError(
                ManifestCode.REPLAY_NOT_TERMINAL,
                str(arguments.replay_event),
            )
        config = GraphDbConfig(
            base_url=arguments.graphdb_url,
            repository_id="music-kg",
            repository_config=REPOSITORY_ROOT / "deployment" / "graphdb" / "repository-config.ttl",
            shapes=REPOSITORY_ROOT / "shapes" / "music-shapes.ttl",
        )
        with GraphDbRepository(config) as repository:
            repository.ensure_ready()
            if arguments.replay_event is not None:
                repository.prepare_replay(str(arguments.replay_event))
            with TemporaryDirectory(prefix="music-kg-outbox-") as temporary:
                for _ in range(arguments.max_events):
                    event = store.claim_due()
                    if event is None:
                        break
                    projection = canonical_projection_event(
                        event,
                        store.graph_rows(),
                        Path(temporary),
                    )
                    outcome = project_event(projection, repository, max_attempts=1)
                    error_code = outcome.error_code or "PROJECTION_FAILED"
                    if outcome.state is EventState.SUCCEEDED:
                        if store.mark_succeeded(event):
                            repository.clear_terminal(str(event.event_id))
                    elif (
                        error_code == "GRAPHDB_UNAVAILABLE"
                        and event.attempt < MAX_CANONICAL_ATTEMPTS
                    ):
                        _ = store.mark_retryable(event, error_code)
                    elif store.owns_lease(event):
                        repository.record_terminal(str(event.event_id), error_code)
                        _ = store.mark_terminal(event, error_code)
                    results.append(
                        {
                            **asdict(outcome),
                            "event_id": str(event.event_id),
                            "generation": str(event.generation_id),
                            "state": str(outcome.state),
                        },
                    )
    except (RetryableRepositoryError, TerminalRepositoryError) as error:
        results.append(
            {
                "event_id": None,
                "generation": 0,
                "state": "REPOSITORY_UNAVAILABLE",
                "error_code": error.code,
            },
        )
    finally:
        database.close()
    arguments.output.parent.mkdir(parents=True, exist_ok=True)
    terminal = any(
        result["state"] in {"TERMINAL_FAILED", "REPOSITORY_UNAVAILABLE"} for result in results
    )
    report = {
        "contract_version": "1.0.0",
        "source": "canonical-postgresql-outbox",
        "status": "TERMINAL_FAILED" if terminal else "SUCCEEDED",
        "consumed_events": len([result for result in results if result["event_id"] is not None]),
        "events": results,
    }
    _ = arguments.output.write_text(
        json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    return 1 if terminal else 0


def main(arguments: Sequence[str] | None = None) -> int:
    selected = sys.argv[1:] if arguments is None else arguments
    try:
        return run(parse_arguments(selected))
    except ProjectionManifestError as error:
        _ = sys.stderr.write(f"{error}\n")
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
