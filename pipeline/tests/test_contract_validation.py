from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import pytest


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
MANIFEST = REPOSITORY_ROOT / "data" / "fixtures" / "manifest.json"


def test_validator_accepts_public_fixture_manifest_and_writes_evidence(tmp_path: Path) -> None:
    # Given
    output = tmp_path / "contract-evidence.json"
    command = [
        sys.executable,
        "-m",
        "pipeline.contracts.validate",
        "--manifest",
        str(MANIFEST),
        "--output",
        str(output),
    ]

    # When
    completed = subprocess.run(command, cwd=REPOSITORY_ROOT, check=False, capture_output=True, text=True)

    # Then
    assert completed.returncode == 0
    evidence = json.loads(output.read_text(encoding="utf-8"))
    assert evidence["status"] == "PASSED"
    assert evidence["network_calls"] == 0
    assert evidence["album_count"] == 30
    assert evidence["review_count"] >= 12


def test_validator_rejects_unconfigured_notion_mapping_without_network(tmp_path: Path) -> None:
    # Given
    output = tmp_path / "failure-evidence.json"
    invalid_manifest = REPOSITORY_ROOT / "data" / "fixtures" / "invalid" / "notion-mapping-unapproved.json"
    command = [
        sys.executable,
        "-m",
        "pipeline.contracts.validate",
        "--manifest",
        str(invalid_manifest),
        "--output",
        str(output),
    ]

    # When
    completed = subprocess.run(command, cwd=REPOSITORY_ROOT, check=False, capture_output=True, text=True)

    # Then
    assert completed.returncode != 0
    assert "NOTION_MAPPING_UNCONFIGURED" in completed.stderr
    evidence = json.loads(output.read_text(encoding="utf-8"))
    assert evidence["network_calls"] == 0


def test_validator_returns_typed_error_for_malformed_manifest() -> None:
    # Given
    from pipeline.contracts.validate import validate_manifest

    malformed = REPOSITORY_ROOT / "data" / "fixtures" / "invalid" / "malformed.json"

    # When
    result = validate_manifest(malformed)

    # Then
    assert result.status == "FAILED"
    assert result.error_codes == ("MALFORMED_CONTRACT",)
    assert result.network_calls == 0


@pytest.mark.parametrize(
    ("mutation", "expected_code"),
    [
        ("placeholder_user_agent", "PLACEHOLDER_USER_AGENT"),
        ("unknown_notion_property", "UNKNOWN_NOTION_PROPERTY"),
        ("unknown_provider_host", "UNAPPROVED_PROVIDER_HOST"),
        ("secret_looking_value", "SECRET_LIKE_VALUE"),
        ("invalid_checksum", "INVALID_CHECKSUM"),
        ("missing_stable_id", "MISSING_STABLE_ID"),
        ("undefined_data_class", "UNDEFINED_DATA_CLASS"),
        ("real_provider_egress", "REAL_PROVIDER_EGRESS_FORBIDDEN"),
        ("llm_egress", "LLM_EGRESS_FORBIDDEN"),
    ],
)
def test_validator_rejects_contract_boundary_violations(mutation: str, expected_code: str) -> None:
    # Given
    from pipeline.contracts.validate import validate_manifest

    # When
    result = validate_manifest(MANIFEST, mutation=mutation)

    # Then
    assert result.status == "FAILED"
    assert expected_code in result.error_codes
