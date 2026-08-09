from __future__ import annotations

import hashlib
import json
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import TYPE_CHECKING, override

from .audit_support import CliInputError, ExitCode, JsonValue, required_option, write_json
from .contracts.validate import validate_manifest
from .graphrag_evaluator import evaluate_scenario
from .graphrag_suite import load_suite

try:
    from .validate_rdf import validate_rdf_path
except ModuleNotFoundError as error:
    if error.name != "rdflib":
        raise
    validate_rdf_path = None

if TYPE_CHECKING:
    from collections.abc import Sequence


def _sha256(path: Path) -> str:
    return f"sha256:{hashlib.sha256(path.read_bytes()).hexdigest()}"


def _root() -> Path:
    return Path(__file__).resolve().parents[2]


@dataclass(frozen=True, slots=True)
class ProjectionEvent:
    event_id: str
    triple: str


@dataclass(frozen=True, slots=True)
class ProjectorInterruptedError(Exception):
    event_id: str

    @override
    def __str__(self) -> str:
        return f"projector interrupted after writing {self.event_id}"


def _project_event(
    event: ProjectionEvent,
    projected: list[str],
    *,
    interrupt_after_write: bool,
) -> bool:
    wrote_triple = event.triple not in projected
    if wrote_triple:
        projected.append(event.triple)
    if interrupt_after_write:
        raise ProjectorInterruptedError(event.event_id)
    return wrote_triple


def _exercise_projection_recovery(
    events: tuple[ProjectionEvent, ...],
    *,
    inject_interrupt: bool,
) -> dict[str, JsonValue]:
    projected: list[str] = []
    processed: set[str] = set()
    attempts = 0
    injected_interrupts = 0
    recovered_projections = 0
    recovering_event_id: str | None = None
    event_trace: list[dict[str, JsonValue]] = []
    for event in events:
        while event.event_id not in processed:
            attempts += 1
            should_interrupt = inject_interrupt and injected_interrupts == 0
            action = "retry" if recovering_event_id == event.event_id else "project"
            try:
                wrote_triple = _project_event(
                    event,
                    projected,
                    interrupt_after_write=should_interrupt,
                )
            except ProjectorInterruptedError as error:
                injected_interrupts += 1
                recovering_event_id = error.event_id
                event_trace.append(
                    {
                        "action": action,
                        "attempt": attempts,
                        "event_id": error.event_id,
                        "outcome": "interrupted_after_write",
                    },
                )
                continue
            processed.add(event.event_id)
            if recovering_event_id == event.event_id:
                recovered_projections += 1
                recovering_event_id = None
                outcome = "projected_recovery" if wrote_triple else "deduplicated_recovery"
            else:
                outcome = "projected" if wrote_triple else "deduplicated"
            event_trace.append(
                {
                    "action": action,
                    "attempt": attempts,
                    "event_id": event.event_id,
                    "outcome": outcome,
                },
            )
    return {
        "duplicate_triples": len(projected) - len(set(projected)),
        "event_trace": event_trace,
        "injected_interrupts": injected_interrupts,
        "outbox_events": len(events),
        "processed_events": len(processed),
        "projector_attempts": attempts,
        "recovered_projections": recovered_projections,
    }


def _local_report(*, inject_interrupt: bool) -> dict[str, JsonValue]:
    root = _root()
    fixture_files = (
        root / "data/fixtures/manifest.json",
        root / "data/fixtures/albums.json",
        root / "data/fixtures/reviews.json",
        root / "data/fixtures/valid/music-graph.ttl",
        root / "data/evaluations/graphrag-golden.jsonl",
        root / "data/evaluations/graphrag-adversarial.jsonl",
    )
    manifest_result = validate_manifest(fixture_files[0])
    if validate_rdf_path is None:
        rdf_conforms = False
        rdf_status = "BLOCKED"
    else:
        rdf_conforms = validate_rdf_path(fixture_files[3]).conforms
        rdf_status = "PASS" if rdf_conforms else "FAIL"
    golden_results = tuple(evaluate_scenario(item) for item in load_suite(fixture_files[4]))
    adversarial_results = tuple(evaluate_scenario(item) for item in load_suite(fixture_files[5]))
    adversarial_rejected = all(
        not item.passed and item.failure_code is not None for item in adversarial_results
    )
    album_ids = tuple(
        f"fixture-album-{index:03d}" for index in range(1, manifest_result.album_count + 1)
    )
    review_ids = tuple(
        f"fixture-review-{index:03d}" for index in range(1, manifest_result.review_count + 1)
    )
    triples = tuple(
        [f"album:{stable_id}|rdf:type|music:ReleaseGroup" for stable_id in album_ids]
        + [f"review:{stable_id}|rdf:type|music:Review" for stable_id in review_ids],
    )
    projection_events = tuple(
        ProjectionEvent(event_id=f"fixture-outbox-{index:03d}", triple=triple)
        for index, triple in enumerate(triples, start=1)
    )
    checksums: dict[str, JsonValue] = {
        str(path.relative_to(root)).replace("\\", "/"): _sha256(path) for path in fixture_files
    }
    local_failed = (
        manifest_result.status != "PASSED"
        or rdf_status == "FAIL"
        or not all(item.passed for item in golden_results)
        or not adversarial_rejected
    )
    external_gates: dict[str, JsonValue] = {
        "fresh_volume_restore": "BLOCKED",
        "protected_vercel_preview": "BLOCKED",
        "remote_deployment_rollback": "BLOCKED",
    }
    fixture_counts: dict[str, JsonValue] = {
        "albums": len(album_ids),
        "reviews": len(review_ids),
    }
    local_checks: dict[str, JsonValue] = {
        "fixture_contract": manifest_result.status,
        "graphrag_adversarial": "PASS" if adversarial_rejected else "FAIL",
        "graphrag_golden": "PASS" if all(item.passed for item in golden_results) else "FAIL",
        "network_calls": manifest_result.network_calls,
        "rdf_shacl": rdf_status,
    }
    projection_recovery = _exercise_projection_recovery(
        projection_events,
        inject_interrupt=inject_interrupt,
    )
    return {
        "checksums": checksums,
        "external_gates": external_gates,
        "fixture_counts": fixture_counts,
        "local_checks": local_checks,
        "projection_recovery": projection_recovery,
        "status": "FAIL" if local_failed else "BLOCKED",
    }


def _write_markdown(path: Path, report: dict[str, JsonValue]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True)
    content = "".join(
        (
            "# Fixture operational demonstration\n\n",
            "The JSON block is the machine-verifiable report. Local checks do not constitute ",
            "remote preview, fresh-volume restore, or deployment rollback proof.\n\n",
            f"```json\n{payload}\n```\n",
        ),
    )
    _ = path.write_text(
        content,
        encoding="utf-8",
    )


def main(arguments: Sequence[str] | None = None) -> ExitCode:
    selected = sys.argv[1:] if arguments is None else arguments
    try:
        output = Path(required_option(selected, "--output"))
        report = _local_report(inject_interrupt="--inject-projector-interrupt" in selected)
    except (CliInputError, KeyError, OSError) as error:
        _ = sys.stderr.write(f"FIXTURE_DEMO_INPUT_ERROR: {error}\n")
        return ExitCode.FAIL
    if output.suffix.lower() == ".json":
        write_json(output, report)
    else:
        _write_markdown(output, report)
    return ExitCode.BLOCKED if report["status"] == "BLOCKED" else ExitCode.FAIL


if __name__ == "__main__":
    raise SystemExit(main())
