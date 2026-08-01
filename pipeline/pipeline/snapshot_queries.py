from __future__ import annotations

import hashlib
import json
import sys
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import TYPE_CHECKING

from .query_execution import execute_bounded_case
from .query_models import JsonValue, QueryCode, QueryRequestError, SnapshotReport
from .query_oracles import canonical_hash, evidence_payload, validate_oracle
from .query_suite import load_suite, parse_suite_line, validate_all

if TYPE_CHECKING:
    from collections.abc import Sequence


__all__ = ["load_suite", "parse_suite_line", "snapshot_suite"]
CLI_ARGUMENT_COUNT = 4


@dataclass(frozen=True, slots=True)
class CliArguments:
    suite: Path
    output: Path


def snapshot_suite(path: Path) -> SnapshotReport:
    cases = load_suite(path)
    results = tuple(
        validate_oracle(case, execute_bounded_case(case)) for case in cases
    )
    return SnapshotReport(
        status="PASSED",
        suite_sha256=hashlib.sha256(path.read_bytes()).hexdigest(),
        snapshot_hash=canonical_hash([evidence_payload(result) for result in results]),
        executed_query_count=len(results),
        results=results,
        errors=(),
    )


def _report_payload(report: SnapshotReport) -> dict[str, JsonValue]:
    return {
        "contract_version": "1.0.0",
        "errors": [
            {**asdict(error), "code": str(error.code)} for error in report.errors
        ],
        "executed_query_count": report.executed_query_count,
        "results": [evidence_payload(result) for result in report.results],
        "snapshot_hash": report.snapshot_hash,
        "status": report.status,
        "suite_sha256": report.suite_sha256,
    }


def _parse_arguments(arguments: Sequence[str]) -> CliArguments:
    if (
        len(arguments) != CLI_ARGUMENT_COUNT
        or arguments[0] != "--suite"
        or arguments[2] != "--output"
    ):
        raise QueryRequestError(
            QueryCode.INVALID_SUITE,
            "cli",
            "--suite PATH --output PATH",
        )
    return CliArguments(suite=Path(arguments[1]), output=Path(arguments[3]))


def run(arguments: CliArguments) -> int:
    cases, errors = validate_all(arguments.suite)
    if errors:
        report = SnapshotReport(
            status="REJECTED",
            suite_sha256=hashlib.sha256(arguments.suite.read_bytes()).hexdigest(),
            snapshot_hash=canonical_hash([]),
            executed_query_count=0,
            results=(),
            errors=errors,
        )
        exit_code = 2
    else:
        results = tuple(
            validate_oracle(case, execute_bounded_case(case)) for case in cases
        )
        report = SnapshotReport(
            status="PASSED",
            suite_sha256=hashlib.sha256(arguments.suite.read_bytes()).hexdigest(),
            snapshot_hash=canonical_hash([evidence_payload(result) for result in results]),
            executed_query_count=len(results),
            results=results,
            errors=(),
        )
        exit_code = 0
    arguments.output.parent.mkdir(parents=True, exist_ok=True)
    _ = arguments.output.write_text(
        json.dumps(_report_payload(report), ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    return exit_code


def main(arguments: Sequence[str] | None = None) -> int:
    selected = sys.argv[1:] if arguments is None else arguments
    try:
        return run(_parse_arguments(selected))
    except QueryRequestError as error:
        _ = sys.stderr.write(f"{error}\n")
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
