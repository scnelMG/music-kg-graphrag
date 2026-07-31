from __future__ import annotations

import sys
from pathlib import Path
from typing import TYPE_CHECKING, Final
from urllib.parse import urlsplit

from .graphdb_repository import GraphDbConfig, GraphDbRepository
from .projection_store import RetryableRepositoryError, TerminalRepositoryError

if TYPE_CHECKING:
    from collections.abc import Sequence


_REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
_REPOSITORY_CONFIG = _REPOSITORY_ROOT / "deployment" / "graphdb" / "repository-config.ttl"
_SHAPES = _REPOSITORY_ROOT / "shapes" / "music-shapes.ttl"
_EXPECTED_ARGUMENT_COUNT: Final = 2


def run(base_url: str) -> int:
    if urlsplit(base_url).scheme not in {"http", "https"}:
        _ = sys.stderr.write("INVALID_GRAPHDB_URL\n")
        return 2
    config = GraphDbConfig(
        base_url=base_url,
        repository_id="music-kg",
        repository_config=_REPOSITORY_CONFIG,
        shapes=_SHAPES,
    )
    try:
        with GraphDbRepository(config) as repository:
            repository.ensure_ready()
    except (RetryableRepositoryError, TerminalRepositoryError) as error:
        _ = sys.stderr.write(f"{error.code}\n")
        return 1
    _ = sys.stdout.write("GRAPHDB_BOOTSTRAP_READY\n")
    return 0


def main(arguments: Sequence[str] | None = None) -> int:
    selected = tuple(sys.argv[1:] if arguments is None else arguments)
    if len(selected) != _EXPECTED_ARGUMENT_COUNT or selected[0] != "--graphdb-url":
        _ = sys.stderr.write("INVALID_GRAPHDB_BOOTSTRAP_ARGUMENTS\n")
        return 2
    return run(selected[1])


if __name__ == "__main__":
    raise SystemExit(main())
