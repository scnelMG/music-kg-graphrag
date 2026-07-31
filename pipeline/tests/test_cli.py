from __future__ import annotations

import subprocess
import sys


def test_fixture_worker_shows_help_when_invoked_as_module() -> None:
    # Given
    command = [sys.executable, "-m", "pipeline", "--help"]

    # When
    completed = subprocess.run(command, check=False, capture_output=True, text=True)

    # Then
    assert completed.returncode == 0
    assert "fixture-only" in completed.stdout.lower()
