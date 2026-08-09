from __future__ import annotations

import sys
from pathlib import Path
from typing import TYPE_CHECKING

from .audit_support import (
    CliInputError,
    ExitCode,
    JsonValue,
    Status,
    has_flag,
    option,
    report_exit,
    required_option,
    write_json,
)

if TYPE_CHECKING:
    from collections.abc import Sequence


def _verified_task13_proof(path: Path) -> bool:
    if not path.is_file() or path.stat().st_size == 0:
        return False
    content = path.read_text(encoding="utf-8")
    return '"status": "PASS"' in content and '"BLOCKED"' not in content


def main(arguments: Sequence[str] | None = None) -> ExitCode:
    selected = sys.argv[1:] if arguments is None else arguments
    try:
        output = Path(required_option(selected, "--output"))
        plan = Path(required_option(selected, "--plan"))
        evidence_dir = Path(
            option(selected, "--evidence-dir", default=".omo/evidence") or ".omo/evidence",
        )
        fixture_missing = has_flag(selected, "--fixture-missing")
        implementation = Path(__file__).with_name("run_fixture_demo.py")
        named_proof = evidence_dir / "task-13-music-kg-evidence-graphrag.md"
        checks: dict[str, JsonValue] = {
            "implementation": implementation.is_file(),
            "named_task13_evidence": _verified_task13_proof(named_proof),
            "plan": plan.is_file()
            and "13. Prove the end-to-end fixture service" in plan.read_text(encoding="utf-8"),
        }
    except (CliInputError, OSError) as error:
        _ = sys.stderr.write(f"PLAN_AUDIT_INPUT_ERROR: {error}\n")
        return ExitCode.FAIL
    if fixture_missing:
        checks["injected_required_proof"] = False
        status = Status.FAIL
        code = "REQUIRED_PROOF_MISSING"
    elif not all(checks.values()):
        status = Status.BLOCKED
        code = "REQUIRED_PROOF_MISSING"
    else:
        status = Status.VERIFIED
        code = "PLAN_COMPLIANT"
    payload: dict[str, JsonValue] = {"checks": checks, "code": code, "status": status.value}
    write_json(output, payload)
    return report_exit(status)


if __name__ == "__main__":
    raise SystemExit(main())
