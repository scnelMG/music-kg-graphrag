from __future__ import annotations

import re
import sys
from pathlib import Path
from typing import TYPE_CHECKING, Final

from .audit_support import (
    CliInputError,
    ExitCode,
    JsonValue,
    Status,
    option,
    report_exit,
    required_option,
    write_json,
)

if TYPE_CHECKING:
    from collections.abc import Sequence

SOURCE_SUFFIXES: Final = frozenset(
    {".java", ".js", ".mjs", ".py", ".sql", ".ts", ".tsx", ".yaml", ".yml"},
)
NOTION_WRITE: Final = re.compile(r"(?is)(?:post|patch)\s*\(.*api\.notion\.com")
PUBLIC_SECRET: Final = re.compile(r"NEXT_PUBLIC_[A-Z0-9_]*(?:SECRET|TOKEN|API_KEY)\s*=")
FORBIDDEN_SCOPE: Final = (
    (f"GENERAL_{'CHATBOT'}", re.compile(r"\bGENERAL" + r"_CHATBOT\b")),
    (f"PREMATURE_{'VECTOR_SEARCH'}", re.compile(r"\bPREMATURE" + r"_VECTOR_SEARCH\b")),
    (f"WORKER_IN_{'VERCEL'}", re.compile(r"\bWORKER_IN" + r"_VERCEL\b")),
)
EXCLUDED_PARTS: Final = frozenset(
    {".git", ".omo", ".tmp", ".venv", "build", "node_modules", "tests"},
)


def _source_files(root: Path) -> tuple[Path, ...]:
    source_names = ("backend", "frontend", "pipeline", "scripts", "deployment")
    roots = tuple(path for name in source_names if (path := root / name).is_dir())
    selected = roots or (root,)
    return tuple(
        path
        for source_root in selected
        for path in source_root.rglob("*")
        if path.is_file()
        and path.suffix.lower() in SOURCE_SUFFIXES
        and not EXCLUDED_PARTS.intersection(path.parts)
    )


def main(arguments: Sequence[str] | None = None) -> ExitCode:
    selected = sys.argv[1:] if arguments is None else arguments
    try:
        output = Path(required_option(selected, "--output"))
        source = Path(option(selected, "--source", default=".") or ".").resolve()
        fixture = option(selected, "--fixture")
        violations: list[str] = []
        for path in _source_files(source):
            content = path.read_text(encoding="utf-8", errors="replace")
            if NOTION_WRITE.search(content):
                violations.append("REAL_NOTION_WRITE")
            if PUBLIC_SECRET.search(content):
                violations.append("PUBLIC_SECRET_EXPOSURE")
            violations.extend(
                violation for violation, pattern in FORBIDDEN_SCOPE if pattern.search(content)
            )
    except (CliInputError, OSError) as error:
        _ = sys.stderr.write(f"SCOPE_AUDIT_INPUT_ERROR: {error}\n")
        return ExitCode.FAIL
    if fixture == "forbidden-real-notion-write":
        violations.append("REAL_NOTION_WRITE_FIXTURE")
    status = Status.FAIL if violations else Status.VERIFIED
    code = "SCOPE_GUARDRAIL_VIOLATION" if violations else "SCOPE_COMPLIANT"
    violation_values: list[str] = sorted(set(violations))
    payload: dict[str, JsonValue] = {
        "code": code,
        "status": status.value,
        "violations": violation_values,
    }
    write_json(output, payload)
    return report_exit(status)


if __name__ == "__main__":
    raise SystemExit(main())
