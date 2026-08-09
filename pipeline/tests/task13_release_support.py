from __future__ import annotations

import hashlib
import hmac
import json
import os
import subprocess
import sys
from typing import TYPE_CHECKING, Protocol

if TYPE_CHECKING:
    from collections.abc import Mapping
    from datetime import datetime
    from pathlib import Path

    from pipeline.audit_support import JsonValue

    class JsonDecoder(Protocol):
        def __call__(self, value: str) -> JsonValue: ...

    decode_json: JsonDecoder
else:
    decode_json = json.loads


def run_module(
    module: str,
    *arguments: str,
    extra_env: Mapping[str, str] | None = None,
) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, "-m", module, *arguments],
        check=False,
        capture_output=True,
        env={**os.environ, **(extra_env or {})},
        text=True,
    )


def read_json(path: Path) -> dict[str, JsonValue]:
    loaded = decode_json(path.read_text(encoding="utf-8"))
    assert isinstance(loaded, dict)
    return loaded


def _release_receipt(gate: str, observed_at: datetime) -> dict[str, JsonValue]:
    evidence_by_gate: dict[str, dict[str, JsonValue]] = {
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
    body: dict[str, JsonValue] = {
        "evidence": evidence_by_gate[gate],
        "gate": gate,
        "observed_at": observed_at.isoformat().replace("+00:00", "Z"),
        "provenance": {
            "collection_mode": "live-command",
            "issuer": "music-kg-ops-verifier",
        },
        "schema_version": "music-kg-release-evidence/v1",
        "status": "PASS",
    }
    canonical = json.dumps(body, ensure_ascii=False, separators=(",", ":"), sort_keys=True)
    body["checksum"] = f"sha256:{hashlib.sha256(canonical.encode()).hexdigest()}"
    return body


def release_source(tmp_path: Path) -> Path:
    source = tmp_path / "source"
    (source / "deployment").mkdir(parents=True)
    (source / "sbom").mkdir()
    _ = (source / "deployment/image-digests.lock").write_text(
        "backend=sha256:fixture\npipeline=sha256:fixture\n",
        encoding="utf-8",
    )
    for name in ("backend.cdx.json", "pipeline.cdx.json"):
        _ = (source / "sbom" / name).write_text('{"bomFormat":"CycloneDX"}\n', encoding="utf-8")
    return source


def write_release_receipts(evidence: Path, observed_at: datetime) -> None:
    inputs = evidence / "f5-inputs"
    inputs.mkdir(parents=True)
    for filename, gate in (
        ("protected-preview.json", "protected-preview"),
        ("fresh-volume-restore.json", "fresh-volume-restore"),
        ("deployment-rollback.json", "deployment-rollback"),
        ("vercel-environments.json", "vercel-environments"),
    ):
        _ = (inputs / filename).write_text(
            json.dumps(_release_receipt(gate, observed_at)),
            encoding="utf-8",
        )


def write_authenticated_release_receipts(
    evidence: Path,
    observed_at: datetime,
    *,
    runtime_key: str,
) -> None:
    inputs = evidence / "f5-inputs"
    transcripts = inputs / "transcripts"
    transcripts.mkdir(parents=True)
    for filename, gate in (
        ("protected-preview.json", "protected-preview"),
        ("fresh-volume-restore.json", "fresh-volume-restore"),
        ("deployment-rollback.json", "deployment-rollback"),
        ("vercel-environments.json", "vercel-environments"),
    ):
        evidence_payload = _release_receipt(gate, observed_at)["evidence"]
        command = (
            sys.executable,
            "-c",
            f"import json; print(json.dumps({evidence_payload!r}, sort_keys=True))",
        )
        completed = subprocess.run(command, check=False, capture_output=True, text=True)
        assert completed.returncode == 0
        transcript: dict[str, JsonValue] = {
            "argv": list(command),
            "exit_code": completed.returncode,
            "schema_version": "music-kg-command-transcript/v1",
            "stderr": completed.stderr,
            "stdout": completed.stdout,
        }
        transcript_bytes = (
            json.dumps(transcript, ensure_ascii=False, indent=2, sort_keys=True) + "\n"
        ).encode()
        _ = (transcripts / filename).write_bytes(transcript_bytes)
        body: dict[str, JsonValue] = {
            "command_artifact": {
                "exit_code": completed.returncode,
                "path": f"transcripts/{filename}",
                "sha256": f"sha256:{hashlib.sha256(transcript_bytes).hexdigest()}",
            },
            "evidence": evidence_payload,
            "gate": gate,
            "observed_at": observed_at.isoformat().replace("+00:00", "Z"),
            "provenance": {
                "collection_mode": "live-command",
                "issuer": "music-kg-ops-verifier",
            },
            "schema_version": "music-kg-release-evidence/v2",
            "status": "PASS",
        }
        canonical = json.dumps(body, ensure_ascii=False, separators=(",", ":"), sort_keys=True)
        body["attestation"] = "hmac-sha256:" + hmac.new(
            runtime_key.encode(),
            canonical.encode(),
            hashlib.sha256,
        ).hexdigest()
        _ = (inputs / filename).write_text(json.dumps(body), encoding="utf-8")
