from __future__ import annotations

import json
import sys
from dataclasses import dataclass
from enum import IntEnum, StrEnum, unique
from pathlib import Path
from typing import TYPE_CHECKING, Final, TypeGuard, override

from rdflib import Graph, Namespace
from rdflib.namespace import RDF
from rdflib.plugins.parsers.notation3 import BadSyntax

if TYPE_CHECKING:
    from collections.abc import Sequence
    from typing import Protocol

    class ShaclValidator(Protocol):
        def __call__(  # noqa: PLR0913
            self,
            data_graph: Graph,
            *,
            shacl_graph: Graph,
            ont_graph: Graph,
            meta_shacl: bool,
            advanced: bool,
            inference: str,
        ) -> tuple[bool, Graph, str]: ...

    validator: ShaclValidator

    type JsonValue = str | int | float | bool | None | list[JsonValue] | dict[str, JsonValue]

    class JsonDecoder(Protocol):
        def __call__(self, value: str) -> JsonValue: ...

    decode_json: JsonDecoder
else:
    from pyshacl import validate as validator

    decode_json = json.loads


REPOSITORY_ROOT: Final = Path(__file__).resolve().parents[2]
ONTOLOGY_PATH: Final = REPOSITORY_ROOT / "ontology" / "music-ontology.ttl"
SHAPES_PATH: Final = REPOSITORY_ROOT / "shapes" / "music-shapes.ttl"
SH: Final = Namespace("http://www.w3.org/ns/shacl#")


@unique
class ExitStatus(IntEnum):
    SUCCESS = 0
    NONCONFORMANT = 1
    INPUT_ERROR = 2


@unique
class InputCode(StrEnum):
    FIXTURE_NOT_DIRECTORY = "FIXTURE_NOT_DIRECTORY"
    MALFORMED_EXPECTED_CODES = "MALFORMED_EXPECTED_CODES"
    MALFORMED_RDF = "MALFORMED_RDF"
    MISSING_ARGUMENT_VALUE = "MISSING_ARGUMENT_VALUE"
    MISSING_REQUIRED_ARGUMENT = "MISSING_REQUIRED_ARGUMENT"
    NO_TTL_FIXTURES = "NO_TTL_FIXTURES"
    UNSUPPORTED_ARGUMENT = "UNSUPPORTED_ARGUMENT"
    UNSUPPORTED_REPORT_FORMAT = "UNSUPPORTED_REPORT_FORMAT"


@dataclass(frozen=True, slots=True)
class CliArguments:
    fixture: Path
    report: Path
    expected_codes: Path | None


@dataclass(frozen=True, slots=True)
class FixtureResult:
    fixture: Path
    conforms: bool
    error_codes: tuple[str, ...]
    report_graph: Graph


@dataclass(frozen=True, slots=True)
class SemanticInputError(Exception):
    code: InputCode
    detail: str

    @override
    def __str__(self) -> str:
        return f"{self.code}: {self.detail}"


def _parse_arguments(arguments: Sequence[str]) -> CliArguments:
    values: dict[str, str] = {}
    index = 0
    while index < len(arguments):
        flag = arguments[index]
        if flag not in {"--fixture", "--report", "--expect-codes"}:
            raise SemanticInputError(InputCode.UNSUPPORTED_ARGUMENT, flag)
        if index + 1 >= len(arguments):
            raise SemanticInputError(InputCode.MISSING_ARGUMENT_VALUE, flag)
        values[flag] = arguments[index + 1]
        index += 2
    if "--fixture" not in values or "--report" not in values:
        raise SemanticInputError(
            InputCode.MISSING_REQUIRED_ARGUMENT,
            "--fixture and --report are required",
        )
    expected = values.get("--expect-codes")
    return CliArguments(
        fixture=Path(values["--fixture"]),
        report=Path(values["--report"]),
        expected_codes=Path(expected) if expected is not None else None,
    )


def _parse_graph(path: Path) -> Graph:
    graph = Graph()
    try:
        _ = graph.parse(path, format="turtle")
    except (BadSyntax, OSError) as error:
        raise SemanticInputError(InputCode.MALFORMED_RDF, str(path)) from error
    return graph


def _extract_codes(report_graph: Graph) -> tuple[str, ...]:
    codes: set[str] = set()
    for result in report_graph.subjects(RDF.type, SH.ValidationResult):
        for message in report_graph.objects(result, SH.resultMessage):
            code, separator, _ = str(message).partition(":")
            if separator:
                codes.add(code)
    return tuple(sorted(codes))


def validate_rdf_path(path: Path) -> FixtureResult:
    ontology = _parse_graph(ONTOLOGY_PATH)
    shapes = _parse_graph(SHAPES_PATH)
    data_graph = _parse_graph(path)
    conforms, report_graph, _ = validator(
        data_graph,
        shacl_graph=shapes,
        ont_graph=ontology,
        meta_shacl=True,
        advanced=False,
        inference="none",
    )
    return FixtureResult(
        fixture=path,
        conforms=conforms,
        error_codes=_extract_codes(report_graph),
        report_graph=report_graph,
    )


def validate_fixture(fixture_directory: Path) -> tuple[FixtureResult, ...]:
    if not fixture_directory.is_dir():
        raise SemanticInputError(
            InputCode.FIXTURE_NOT_DIRECTORY,
            str(fixture_directory),
        )
    fixture_paths = tuple(sorted(fixture_directory.glob("*.ttl")))
    if not fixture_paths:
        raise SemanticInputError(InputCode.NO_TTL_FIXTURES, str(fixture_directory))

    return tuple(validate_rdf_path(fixture_path) for fixture_path in fixture_paths)


def _load_expected_codes(path: Path) -> dict[str, tuple[str, ...]]:
    try:
        loaded = decode_json(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError) as error:
        raise SemanticInputError(
            InputCode.MALFORMED_EXPECTED_CODES,
            str(path),
        ) from error
    if not isinstance(loaded, dict):
        raise SemanticInputError(InputCode.MALFORMED_EXPECTED_CODES, str(path))
    expected: dict[str, tuple[str, ...]] = {}
    for name, codes in loaded.items():
        if not _is_string_list(codes):
            raise SemanticInputError(
                InputCode.MALFORMED_EXPECTED_CODES,
                str(path),
            )
        expected[name] = tuple(sorted(codes))
    return expected


def _is_string_list(value: JsonValue) -> TypeGuard[list[str]]:
    return isinstance(value, list) and all(isinstance(item, str) for item in value)


def _write_report(report_path: Path, results: tuple[FixtureResult, ...]) -> None:
    report_path.parent.mkdir(parents=True, exist_ok=True)
    if report_path.suffix.lower() == ".ttl":
        combined = Graph()
        for result in results:
            combined += result.report_graph
        _ = combined.serialize(destination=report_path, format="turtle")
        return
    if report_path.suffix.lower() != ".json":
        raise SemanticInputError(
            InputCode.UNSUPPORTED_REPORT_FORMAT,
            str(report_path),
        )
    payload = {
        "status": "CONFORMS" if all(result.conforms for result in results) else "NONCONFORMANT",
        "network_calls": 0,
        "fixtures": [
            {
                "fixture": result.fixture.name,
                "conforms": result.conforms,
                "error_codes": list(result.error_codes),
            }
            for result in results
        ],
    }
    _ = report_path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def run(arguments: CliArguments) -> ExitStatus:
    results = validate_fixture(arguments.fixture)
    _write_report(arguments.report, results)
    if arguments.expected_codes is not None:
        expected = _load_expected_codes(arguments.expected_codes)
        actual = {result.fixture.name: result.error_codes for result in results}
        if actual != expected:
            _ = sys.stderr.write("EXPECTED_CODES_MISMATCH\n")
            return ExitStatus.NONCONFORMANT
        _ = sys.stdout.write("EXPECTED_VIOLATIONS\n")
        return ExitStatus.SUCCESS
    if all(result.conforms for result in results):
        _ = sys.stdout.write("CONFORMS\n")
        return ExitStatus.SUCCESS
    codes = sorted({code for result in results for code in result.error_codes})
    _ = sys.stderr.write(" ".join(codes) + "\n")
    return ExitStatus.NONCONFORMANT


def main(arguments: Sequence[str] | None = None) -> ExitStatus:
    selected = sys.argv[1:] if arguments is None else arguments
    try:
        return run(_parse_arguments(selected))
    except SemanticInputError as error:
        _ = sys.stderr.write(f"{error}\n")
        return ExitStatus.INPUT_ERROR


if __name__ == "__main__":
    raise SystemExit(main())
