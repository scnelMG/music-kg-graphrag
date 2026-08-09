from __future__ import annotations

import hashlib
import hmac
import json
import re
import sys
from collections.abc import Mapping
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import TYPE_CHECKING, Final, Protocol

from .audit_support import (
    CliInputError,
    ExitCode,
    JsonValue,
    Status,
    option,
    report_exit,
    required_option,
    runtime_attestation_key,
    valid_command_artifact,
    write_json,
)

if TYPE_CHECKING:
    from collections.abc import Sequence

    class JsonDecoder(Protocol):
        def __call__(self, value: str) -> JsonValue: ...

    decode_json: JsonDecoder
else:
    decode_json = json.loads

PUBLIC_SECRET: Final = re.compile(r"NEXT_PUBLIC_[A-Z0-9_]*(?:SECRET|TOKEN|API_KEY)\s*=")
RECEIPT_VERSION: Final = "music-kg-release-evidence/v2"
TRANSCRIPT_VERSION: Final = "music-kg-command-transcript/v1"
ATTESTATION_KEY_ENV: Final = "MUSIC_KG_RELEASE_ATTESTATION_KEY"
MINIMUM_ATTESTATION_KEY_BYTES: Final = 32
RECEIPT_MAX_AGE: Final = timedelta(hours=24)
RECEIPT_FUTURE_TOLERANCE: Final = timedelta(minutes=5)
EXPECTED_PROVENANCE: Final[dict[str, JsonValue]] = {
    "collection_mode": "live-command",
    "issuer": "music-kg-ops-verifier",
}
EXPECTED_EVIDENCE: Final[dict[str, dict[str, JsonValue]]] = {
    "deployment-rollback": {
        "artifact_kind": "cloud_run_rollback",
        "rollback_exit_code": 0,
        "service_healthy": True,
    },
    "fresh-volume-restore": {
        "artifact_kind": "postgres_fresh_volume_restore",
        "graph_verified": True,
        "restore_exit_code": 0,
    },
    "protected-preview": {
        "access_control": "protected",
        "artifact_kind": "vercel_protected_preview",
        "health_status": 200,
    },
    "vercel-environments": {
        "artifact_kind": "vercel_environment_inventory",
        "preview_configured": True,
        "production_configured": True,
        "public_secret_exposure": False,
    },
}


def _nonempty(path: Path) -> bool:
    return path.is_file() and path.stat().st_size > 0


def _mapping(value: JsonValue | None) -> Mapping[str, JsonValue] | None:
    return value if isinstance(value, Mapping) else None


def _fresh_observation(value: JsonValue | None, *, now: datetime) -> bool:
    if not isinstance(value, str):
        return False
    try:
        observed_at = datetime.fromisoformat(value)
    except ValueError:
        return False
    if observed_at.tzinfo is None:
        return False
    age = now - observed_at.astimezone(UTC)
    return -RECEIPT_FUTURE_TOLERANCE <= age <= RECEIPT_MAX_AGE


def _valid_receipt(
    path: Path,
    *,
    gate: str,
    now: datetime,
    attestation_key: bytes | None,
) -> bool:
    if attestation_key is None or not path.is_file():
        return False
    try:
        loaded = decode_json(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, UnicodeError):
        return False
    receipt = _mapping(loaded)
    if receipt is None or set(receipt) != {
        "attestation",
        "command_artifact",
        "evidence",
        "gate",
        "observed_at",
        "provenance",
        "schema_version",
        "status",
    }:
        return False
    attestation = receipt.get("attestation")
    body: dict[str, JsonValue] = {
        key: value for key, value in receipt.items() if key != "attestation"
    }
    canonical = json.dumps(body, ensure_ascii=False, separators=(",", ":"), sort_keys=True)
    expected_attestation = "hmac-sha256:" + hmac.new(
        attestation_key,
        canonical.encode(),
        hashlib.sha256,
    ).hexdigest()
    provenance = _mapping(receipt.get("provenance"))
    evidence = _mapping(receipt.get("evidence"))
    return (
        receipt.get("schema_version") == RECEIPT_VERSION
        and receipt.get("gate") == gate
        and receipt.get("status") == "PASS"
        and provenance == EXPECTED_PROVENANCE
        and evidence == EXPECTED_EVIDENCE[gate]
        and isinstance(attestation, str)
        and hmac.compare_digest(attestation, expected_attestation)
        and valid_command_artifact(
            path,
            _mapping(receipt.get("command_artifact")),
            evidence=EXPECTED_EVIDENCE[gate],
            transcript_version=TRANSCRIPT_VERSION,
        )
        and _fresh_observation(receipt.get("observed_at"), now=now)
    )


def main(arguments: Sequence[str] | None = None) -> ExitCode:
    selected = sys.argv[1:] if arguments is None else arguments
    try:
        output = Path(required_option(selected, "--output"))
        evidence = Path(
            option(selected, "--evidence-dir", default=".omo/evidence") or ".omo/evidence",
        )
        source = Path(option(selected, "--source", default=".") or ".")
        fixture = option(selected, "--fixture")
        frontend_env = source / "frontend/.env.example"
        public_secret_clean = not frontend_env.is_file() or not PUBLIC_SECRET.search(
            frontend_env.read_text(encoding="utf-8"),
        )
        now = datetime.now(UTC)
        attestation_key = runtime_attestation_key(
            ATTESTATION_KEY_ENV,
            minimum_bytes=MINIMUM_ATTESTATION_KEY_BYTES,
        )
        checks: dict[str, JsonValue] = {
            "image_digest_lock": _nonempty(source / "deployment/image-digests.lock"),
            "no_public_secret_assignment": public_secret_clean,
            "protected_preview_receipt": _valid_receipt(
                evidence / "f5-inputs/protected-preview.json",
                gate="protected-preview",
                now=now,
                attestation_key=attestation_key,
            ),
            "restore_receipt": _valid_receipt(
                evidence / "f5-inputs/fresh-volume-restore.json",
                gate="fresh-volume-restore",
                now=now,
                attestation_key=attestation_key,
            ),
            "rollback_receipt": _valid_receipt(
                evidence / "f5-inputs/deployment-rollback.json",
                gate="deployment-rollback",
                now=now,
                attestation_key=attestation_key,
            ),
            "sbom": _nonempty(source / "sbom/backend.cdx.json")
            and _nonempty(source / "sbom/pipeline.cdx.json"),
            "vercel_environment_receipt": _valid_receipt(
                evidence / "f5-inputs/vercel-environments.json",
                gate="vercel-environments",
                now=now,
                attestation_key=attestation_key,
            ),
        }
    except (CliInputError, OSError) as error:
        _ = sys.stderr.write(f"RELEASE_AUDIT_INPUT_ERROR: {error}\n")
        return ExitCode.FAIL
    if fixture == "missing-restore-artifact":
        checks["restore_receipt"] = False
        status = Status.FAIL
        code = "RELEASE_GATE_FAILED"
    elif not all(checks.values()):
        status = Status.BLOCKED
        code = "EXTERNAL_PROOF_BLOCKED"
    else:
        status = Status.VERIFIED
        code = "RELEASE_GATES_PASSED"
    payload: dict[str, JsonValue] = {"checks": checks, "code": code, "status": status.value}
    write_json(output, payload)
    return report_exit(status)


if __name__ == "__main__":
    raise SystemExit(main())
