from __future__ import annotations

import secrets
from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING

from tests.task13_release_support import (
    read_json,
    release_source,
    run_module,
    write_authenticated_release_receipts,
    write_release_receipts,
)

if TYPE_CHECKING:
    from pathlib import Path


def test_release_audit_blocks_when_external_proof_is_absent(tmp_path: Path) -> None:
    output = tmp_path / "release.json"

    completed = run_module(
        "pipeline.audit_release_gates",
        "--evidence-dir",
        str(tmp_path),
        "--output",
        str(output),
    )

    report = read_json(output)
    assert completed.returncode == 3
    assert report["status"] == "BLOCKED"
    assert report["code"] == "EXTERNAL_PROOF_BLOCKED"


def test_release_audit_rejects_arbitrary_nonempty_receipts(tmp_path: Path) -> None:
    source = release_source(tmp_path)
    evidence = tmp_path / "evidence"
    inputs = evidence / "f5-inputs"
    inputs.mkdir(parents=True)
    for name in (
        "protected-preview.json",
        "fresh-volume-restore.json",
        "deployment-rollback.json",
        "vercel-environments.json",
    ):
        _ = (inputs / name).write_text("stale-or-forged", encoding="utf-8")
    output = tmp_path / "release.json"

    completed = run_module(
        "pipeline.audit_release_gates",
        "--source",
        str(source),
        "--evidence-dir",
        str(evidence),
        "--output",
        str(output),
    )

    report = read_json(output)
    checks = report["checks"]
    assert completed.returncode == 3
    assert report["status"] == "BLOCKED"
    assert isinstance(checks, dict)
    assert checks["protected_preview_receipt"] is False


def test_release_audit_rejects_stale_structured_receipts(tmp_path: Path) -> None:
    source = release_source(tmp_path)
    evidence = tmp_path / "evidence"
    write_release_receipts(evidence, datetime.now(UTC) - timedelta(days=2))
    output = tmp_path / "release.json"

    completed = run_module(
        "pipeline.audit_release_gates",
        "--source",
        str(source),
        "--evidence-dir",
        str(evidence),
        "--output",
        str(output),
    )

    report = read_json(output)
    checks = report["checks"]
    assert completed.returncode == 3
    assert report["status"] == "BLOCKED"
    assert isinstance(checks, dict)
    assert checks["restore_receipt"] is False


def test_release_audit_blocks_fresh_self_minted_receipts_without_runtime_key(
    tmp_path: Path,
) -> None:
    source = release_source(tmp_path)
    evidence = tmp_path / "evidence"
    write_release_receipts(evidence, datetime.now(UTC))
    output = tmp_path / "release.json"

    completed = run_module(
        "pipeline.audit_release_gates",
        "--source",
        str(source),
        "--evidence-dir",
        str(evidence),
        "--output",
        str(output),
        extra_env={"MUSIC_KG_RELEASE_ATTESTATION_KEY": ""},
    )

    report = read_json(output)
    checks = report["checks"]
    assert completed.returncode == 3
    assert report["status"] == "BLOCKED"
    assert isinstance(checks, dict)
    assert checks == {
        "image_digest_lock": True,
        "no_public_secret_assignment": True,
        "protected_preview_receipt": False,
        "restore_receipt": False,
        "rollback_receipt": False,
        "sbom": True,
        "vercel_environment_receipt": False,
    }


def test_release_audit_accepts_authenticated_live_command_transcripts(tmp_path: Path) -> None:
    source = release_source(tmp_path)
    evidence = tmp_path / "evidence"
    runtime_key = secrets.token_hex(32)
    write_authenticated_release_receipts(
        evidence,
        datetime.now(UTC),
        runtime_key=runtime_key,
    )
    output = tmp_path / "release.json"

    completed = run_module(
        "pipeline.audit_release_gates",
        "--source",
        str(source),
        "--evidence-dir",
        str(evidence),
        "--output",
        str(output),
        extra_env={"MUSIC_KG_RELEASE_ATTESTATION_KEY": runtime_key},
    )

    report = read_json(output)
    checks = report["checks"]
    assert completed.returncode == 0
    assert report["status"] == "PASS"
    assert isinstance(checks, dict)
    assert all(checks.values())


def test_release_audit_rejects_live_transcripts_attested_by_untrusted_key(
    tmp_path: Path,
) -> None:
    source = release_source(tmp_path)
    evidence = tmp_path / "evidence"
    attacker_key = secrets.token_hex(32)
    verifier_key = secrets.token_hex(32)
    write_authenticated_release_receipts(
        evidence,
        datetime.now(UTC),
        runtime_key=attacker_key,
    )
    output = tmp_path / "release.json"

    completed = run_module(
        "pipeline.audit_release_gates",
        "--source",
        str(source),
        "--evidence-dir",
        str(evidence),
        "--output",
        str(output),
        extra_env={"MUSIC_KG_RELEASE_ATTESTATION_KEY": verifier_key},
    )

    report = read_json(output)
    checks = report["checks"]
    assert completed.returncode == 3
    assert report["status"] == "BLOCKED"
    assert isinstance(checks, dict)
    assert checks["protected_preview_receipt"] is False
