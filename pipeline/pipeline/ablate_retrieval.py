from __future__ import annotations

import json
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import TYPE_CHECKING

import psycopg

from .pgvector_retrieval import EmbeddingVersionConflictError, PgvectorExactStore
from .retrieval_ablation import evaluate
from .retrieval_suite import RetrievalSuiteError, load_suite

if TYPE_CHECKING:
    from collections.abc import Sequence

    from .query_models import JsonValue


LOCAL_ARGUMENT_COUNT = 4
PGVECTOR_ARGUMENT_COUNT = 6


@dataclass(frozen=True, slots=True)
class Arguments:
    suite: Path
    output: Path
    postgres_dsn: str | None


def _write(path: Path, payload: dict[str, JsonValue]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f".{path.name}.tmp")
    _ = temporary.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    _ = temporary.replace(path)


def _parse(arguments: Sequence[str]) -> Arguments:
    if (
        len(arguments) not in (LOCAL_ARGUMENT_COUNT, PGVECTOR_ARGUMENT_COUNT)
        or arguments[0] != "--suite"
        or arguments[2] != "--output"
        or (
            len(arguments) == PGVECTOR_ARGUMENT_COUNT
            and arguments[4] != "--postgres-dsn"
        )
    ):
        error = RetrievalSuiteError.invalid(
            "arguments",
            "--suite PATH --output PATH --postgres-dsn DSN",
        )
        raise error
    postgres_dsn = arguments[5] if len(arguments) == PGVECTOR_ARGUMENT_COUNT else None
    return Arguments(Path(arguments[1]), Path(arguments[3]), postgres_dsn)


def run(arguments: Arguments) -> int:
    try:
        suite = load_suite(arguments.suite)
        if arguments.postgres_dsn is None:
            payload = evaluate(suite, arguments.suite.read_bytes())
        else:
            retrieval = PgvectorExactStore(arguments.postgres_dsn)
            payload = evaluate(suite, arguments.suite.read_bytes(), retrieval)
    except (EmbeddingVersionConflictError, RetrievalSuiteError, OSError, psycopg.Error) as error:
        payload: dict[str, JsonValue] = {
            "contract_version": "retrieval-ablation/2.0.0",
            "status": "REJECTED",
            "vector_feature_enabled": False,
            "error": {"code": "INVALID_SUITE", "detail": str(error)},
        }
        _write(arguments.output, payload)
        return 2
    _write(arguments.output, payload)
    return 0 if payload["vector_feature_enabled"] is True else 2


def main(arguments: Sequence[str] | None = None) -> int:
    selected = sys.argv[1:] if arguments is None else arguments
    try:
        parsed = _parse(selected)
    except RetrievalSuiteError as error:
        _ = sys.stderr.write(f"{error}\n")
        return 2
    return run(parsed)


if __name__ == "__main__":
    raise SystemExit(main())
