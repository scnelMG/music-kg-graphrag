from __future__ import annotations

import re
import sys
from pathlib import Path
from typing import TYPE_CHECKING, Final

from .audit_support import CliInputError, ExitCode, option, redact_secret_like, required_option

if TYPE_CHECKING:
    from collections.abc import Sequence

SECRET_FIXTURE: Final = re.compile(
    r"(?i)(?:api[_-]?key|password|secret|token)\s*[:=]\s*[^\s#]{8,}",
)
HARDCODED_SECRET: Final = re.compile(
    r"""(?i)(?:api[_-]?key|password|secret|token)\s*[:=]\s*["'][^"'\s]{8,}["']""",
)
UNSAFE: Final = re.compile(r"(?m)(?:shell\s*=\s*True|\beval\s*\(|\bexec\s*\()")
SAFE_STATIC_DATABASE_EXEC: Final = re.compile(
    r"\bdatabase\s*\.\s*exec\s*\(\s*(?:\"[^\"]*\"|'[^']*'|`[^`$]*`)\s*\)",
)
SUFFIXES: Final = frozenset({".java", ".js", ".mjs", ".py", ".sql", ".ts", ".tsx", ".yaml", ".yml"})
EXCLUDED_PARTS: Final = frozenset(
    {".git", ".next", ".omo", ".tmp", ".venv", "build", "node_modules", "test", "tests"},
)
SAFE_FIXTURE_MARKERS: Final = ("example", "fixture", "local-e2e", "test-only")


def _excluded(path: Path) -> bool:
    return any(part in EXCLUDED_PARTS or part.startswith(".venv") for part in path.parts)


def _hardcoded_secret_count(content: str) -> int:
    return sum(
        1
        for match in HARDCODED_SECRET.finditer(content)
        if not any(marker in match.group(0).casefold() for marker in SAFE_FIXTURE_MARKERS)
    )


def _unsafe_code_count(content: str) -> int:
    return len(UNSAFE.findall(content)) - len(SAFE_STATIC_DATABASE_EXEC.findall(content))


def _files(source: Path) -> tuple[Path, ...]:
    source_names = ("backend", "frontend", "pipeline", "scripts", "deployment", "ontology")
    roots = tuple(path for name in source_names if (path := source / name).is_dir())
    selected = roots or (source,)
    return tuple(
        path
        for root in selected
        for path in root.rglob("*")
        if path.is_file()
        and path.suffix.lower() in SUFFIXES
        and not _excluded(path)
    )


def main(arguments: Sequence[str] | None = None) -> ExitCode:
    selected = sys.argv[1:] if arguments is None else arguments
    try:
        output = Path(required_option(selected, "--output"))
        source = Path(option(selected, "--source", default=".") or ".").resolve()
        fixture_value = option(selected, "--fixture")
        files = list(_files(source))
        secret_hits = 0
        unsafe_hits = 0
        for path in files:
            content = path.read_text(encoding="utf-8", errors="replace")
            secret_hits += _hardcoded_secret_count(content)
            unsafe_hits += _unsafe_code_count(content)
        if fixture_value is not None:
            fixture_content = Path(fixture_value).read_text(encoding="utf-8", errors="replace")
            secret_hits += len(SECRET_FIXTURE.findall(fixture_content))
    except (CliInputError, OSError) as error:
        _ = sys.stderr.write(f"CODE_QUALITY_INPUT_ERROR: {redact_secret_like(str(error))}\n")
        return ExitCode.FAIL
    status = "FAIL" if secret_hits or unsafe_hits else "PASS"
    if secret_hits:
        code = "SECRET_PATTERN_DETECTED"
    elif unsafe_hits:
        code = "UNSAFE_CODE_PATTERN"
    else:
        code = "CODE_QUALITY_PASS"
    output.parent.mkdir(parents=True, exist_ok=True)
    report = "".join(
        (
            "# Code quality audit\n\n",
            f"- status: {status}\n- code: {code}\n- files_scanned: {len(files)}\n",
            f"- secret_pattern_hits: {secret_hits}\n- unsafe_pattern_hits: {unsafe_hits}\n",
        ),
    )
    _ = output.write_text(
        report,
        encoding="utf-8",
    )
    stream = sys.stderr if status == "FAIL" else sys.stdout
    _ = stream.write(f"{code}\n")
    return ExitCode.FAIL if status == "FAIL" else ExitCode.VERIFIED


if __name__ == "__main__":
    raise SystemExit(main())
