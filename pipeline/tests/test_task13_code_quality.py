from __future__ import annotations

import subprocess
import sys
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from pathlib import Path


def _run_module(
    module: str,
    *arguments: str,
) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, "-m", module, *arguments],
        check=False,
        capture_output=True,
        text=True,
    )


def test_code_quality_secret_fixture_is_redacted(tmp_path: Path) -> None:
    # Given
    fixture = tmp_path / "secret.txt"
    _ = fixture.write_text("api_key=task13-super-secret-value\n", encoding="utf-8")
    output = tmp_path / "quality.md"

    # When
    completed = _run_module(
        "pipeline.review_code_quality",
        "--source",
        str(tmp_path),
        "--fixture",
        str(fixture),
        "--output",
        str(output),
    )

    # Then
    assert completed.returncode == 2
    assert "SECRET_PATTERN_DETECTED" in completed.stderr
    assert "task13-super-secret-value" not in completed.stdout
    assert "task13-super-secret-value" not in completed.stderr
    assert "task13-super-secret-value" not in output.read_text(encoding="utf-8")


def test_code_quality_missing_secret_named_fixture_is_redacted(tmp_path: Path) -> None:
    # Given
    fixture = tmp_path / "api_key=task13-super-secret-value.txt"
    output = tmp_path / "quality.md"

    # When
    completed = _run_module(
        "pipeline.review_code_quality",
        "--source",
        str(tmp_path),
        "--fixture",
        str(fixture),
        "--output",
        str(output),
    )

    # Then
    assert completed.returncode == 2
    assert "CODE_QUALITY_INPUT_ERROR" in completed.stderr
    assert "task13-super-secret-value" not in completed.stdout
    assert "task13-super-secret-value" not in completed.stderr


def test_code_quality_allows_runtime_secret_references(tmp_path: Path) -> None:
    # Given
    source = tmp_path / "service.py"
    _ = source.write_text("shared_secret = settings.shared_secret\n", encoding="utf-8")
    output = tmp_path / "quality.md"

    # When
    completed = _run_module(
        "pipeline.review_code_quality",
        "--source",
        str(tmp_path),
        "--output",
        str(output),
    )

    # Then
    assert completed.returncode == 0
    assert "CODE_QUALITY_PASS" in completed.stdout


def test_code_quality_allows_static_database_exec_migrations(tmp_path: Path) -> None:
    # Given
    source = tmp_path / "migration.mjs"
    line_break = "\n"
    _ = source.write_text(
        line_break.join(
            (
                'database.exec("BEGIN EXCLUSIVE");',
                'database.exec("CREATE TABLE build_lock_owner (id INTEGER PRIMARY KEY)");',
                'database.exec("COMMIT");',
            ),
        )
        + line_break,
        encoding="utf-8",
    )
    output = tmp_path / "quality.md"

    # When
    completed = _run_module(
        "pipeline.review_code_quality",
        "--source",
        str(tmp_path),
        "--output",
        str(output),
    )

    # Then
    assert completed.returncode == 0
    assert "CODE_QUALITY_PASS" in completed.stdout
    assert "unsafe_pattern_hits: 0" in output.read_text(encoding="utf-8")


def test_code_quality_rejects_dynamic_database_exec_query(tmp_path: Path) -> None:
    # Given
    source = tmp_path / "migration.mjs"
    line_break = "\n"
    _ = source.write_text(
        line_break.join(
            (
                "const tableName = process.env.TABLE_NAME;",
                'database.exec("DROP TABLE " + tableName);',
            ),
        ),
        encoding="utf-8",
    )
    output = tmp_path / "quality.md"

    # When
    completed = _run_module(
        "pipeline.review_code_quality",
        "--source",
        str(tmp_path),
        "--output",
        str(output),
    )

    # Then
    assert completed.returncode == 2
    assert "UNSAFE_CODE_PATTERN" in completed.stderr
    assert "unsafe_pattern_hits: 1" in output.read_text(encoding="utf-8")
