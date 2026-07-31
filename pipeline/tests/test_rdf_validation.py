from __future__ import annotations

import subprocess
import sys
from pathlib import Path
from typing import TYPE_CHECKING, Protocol, TypedDict

import pytest
from rdflib import Graph

from pipeline.validate_rdf import validate_fixture

if TYPE_CHECKING:

    class ReportPayload(TypedDict):
        status: str
        network_calls: int
        fixtures: list[dict[str, str | bool | list[str]]]

    class ReportDecoder(Protocol):
        def __call__(self, value: str) -> ReportPayload: ...

    decode_report: ReportDecoder
else:
    from json import loads as decode_report


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
VALID_FIXTURES = REPOSITORY_ROOT / "data" / "fixtures" / "valid"
INVALID_FIXTURES = REPOSITORY_ROOT / "data" / "fixtures" / "invalid"
EXPECTED_CODES = INVALID_FIXTURES / "expected-codes.json"


def test_cli_accepts_valid_semantic_fixture_and_writes_report(tmp_path: Path) -> None:
    # Given
    report = tmp_path / "valid-report.ttl"
    command = [
        sys.executable,
        "-m",
        "pipeline.validate_rdf",
        "--fixture",
        str(VALID_FIXTURES),
        "--report",
        str(report),
    ]

    # When
    completed = subprocess.run(
        command,
        cwd=REPOSITORY_ROOT,
        check=False,
        capture_output=True,
        text=True,
    )

    # Then
    assert completed.returncode == 0
    assert "CONFORMS" in completed.stdout
    assert report.is_file()
    assert report.read_text(encoding="utf-8").strip()


def test_rdflib_parses_every_semantic_turtle_file() -> None:
    # Given
    paths = (
        *sorted((REPOSITORY_ROOT / "ontology").glob("*.ttl")),
        *sorted((REPOSITORY_ROOT / "shapes").glob("*.ttl")),
        *sorted((REPOSITORY_ROOT / "data" / "fixtures").rglob("*.ttl")),
    )

    # When
    parsed_sizes = tuple(len(Graph().parse(path, format="turtle")) for path in paths)
    empty_files = tuple(
        path.relative_to(REPOSITORY_ROOT).as_posix()
        for path, size in zip(paths, parsed_sizes, strict=True)
        if size == 0
    )

    # Then
    assert paths
    assert empty_files == ("ontology/prefixes.ttl",)


def test_valid_fixture_conforms_with_meta_shacl_enabled() -> None:
    # Given / When
    results = validate_fixture(VALID_FIXTURES)

    # Then
    assert tuple(
        (result.fixture.name, result.conforms, result.error_codes) for result in results
    ) == (("music-graph.ttl", True, ()),)


@pytest.fixture(scope="module")
def invalid_outcomes() -> tuple[tuple[str, bool, tuple[str, ...]], ...]:
    return tuple(
        (result.fixture.name, result.conforms, result.error_codes)
        for result in validate_fixture(INVALID_FIXTURES)
    )


@pytest.mark.parametrize(
    ("fixture_name", "expected_code"),
    [
        ("missing-artist.ttl", "MISSING_ARTIST"),
        ("missing-release-identity.ttl", "MISSING_RELEASE_IDENTITY"),
        ("missing-listening-context.ttl", "MISSING_LISTENING_CONTEXT"),
        ("missing-source.ttl", "MISSING_SOURCE"),
        ("confidence-out-of-range.ttl", "CONFIDENCE_OUT_OF_RANGE"),
        ("missing-evidence-path.ttl", "MISSING_EVIDENCE_PATH"),
        ("missing-recommendation-reason.ttl", "MISSING_RECOMMENDATION_REASON"),
        ("assertion-missing-stable-id.ttl", "MISSING_STABLE_ID"),
        ("assertion-missing-subject.ttl", "MISSING_ASSERTED_SUBJECT"),
        ("assertion-missing-predicate.ttl", "MISSING_ASSERTED_PREDICATE"),
        ("assertion-missing-object.ttl", "MISSING_ASSERTED_OBJECT"),
        ("assertion-missing-retrieval-run.ttl", "MISSING_RETRIEVAL_RUN"),
        ("assertion-missing-named-graph.ttl", "MISSING_NAMED_GRAPH"),
    ],
)
def test_targeted_invalid_fixture_reports_exact_code(
    fixture_name: str,
    expected_code: str,
    invalid_outcomes: tuple[tuple[str, bool, tuple[str, ...]], ...],
) -> None:
    # Given
    indexed_results = {
        name: (conforms, error_codes)
        for name, conforms, error_codes in invalid_outcomes
    }

    # When
    conforms, error_codes = indexed_results[fixture_name]

    # Then
    assert conforms is False
    assert error_codes == (expected_code,)


def test_cli_accepts_expected_invalid_codes_and_writes_json_report(
    tmp_path: Path,
) -> None:
    # Given
    report = tmp_path / "invalid-report.json"
    command = [
        sys.executable,
        "-m",
        "pipeline.validate_rdf",
        "--fixture",
        str(INVALID_FIXTURES),
        "--expect-codes",
        str(EXPECTED_CODES),
        "--report",
        str(report),
    ]

    # When
    completed = subprocess.run(
        command,
        cwd=REPOSITORY_ROOT,
        check=False,
        capture_output=True,
        text=True,
    )

    # Then
    assert completed.returncode == 0
    assert completed.stdout.strip() == "EXPECTED_VIOLATIONS"
    payload = decode_report(report.read_text(encoding="utf-8"))
    assert payload["status"] == "NONCONFORMANT"
    assert payload["network_calls"] == 0
    assert len(payload["fixtures"]) == 13


def test_cli_returns_input_error_for_malformed_turtle(tmp_path: Path) -> None:
    # Given
    fixture_directory = tmp_path / "malformed"
    fixture_directory.mkdir()
    _ = (fixture_directory / "broken.ttl").write_text(
        "@prefix music: <https://w3id.org/music-kg-graphrag/ontology#> . [",
        encoding="utf-8",
    )
    report = tmp_path / "malformed-report.json"

    # When
    completed = subprocess.run(
        [
            sys.executable,
            "-m",
            "pipeline.validate_rdf",
            "--fixture",
            str(fixture_directory),
            "--report",
            str(report),
        ],
        cwd=REPOSITORY_ROOT,
        check=False,
        capture_output=True,
        text=True,
    )

    # Then
    assert completed.returncode == 2
    assert completed.stderr.startswith("MALFORMED_RDF:")
    assert not report.exists()


def test_cli_rejects_fixture_file_instead_of_directory(tmp_path: Path) -> None:
    # Given
    report = tmp_path / "unsupported-report.json"

    # When
    completed = subprocess.run(
        [
            sys.executable,
            "-m",
            "pipeline.validate_rdf",
            "--fixture",
            str(VALID_FIXTURES / "music-graph.ttl"),
            "--report",
            str(report),
        ],
        cwd=REPOSITORY_ROOT,
        check=False,
        capture_output=True,
        text=True,
    )

    # Then
    assert completed.returncode == 2
    assert completed.stderr.startswith("FIXTURE_NOT_DIRECTORY:")
    assert not report.exists()
