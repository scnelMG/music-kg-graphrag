from __future__ import annotations

import hashlib
import hmac
import json
import os
import re
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from enum import IntEnum, StrEnum
from typing import TYPE_CHECKING, Protocol, override

if TYPE_CHECKING:
    from pathlib import Path

    class JsonDecoder(Protocol):
        def __call__(self, value: str) -> JsonValue: ...

    decode_json: JsonDecoder
else:
    decode_json = json.loads

type JsonScalar = str | int | float | bool | None
type JsonValue = JsonScalar | Sequence[JsonValue] | Mapping[str, JsonValue]

SECRET_ASSIGNMENT = re.compile(
    r"(?i)((?:api[_-]?key|password|secret|token)\s*[:=]\s*)[^\s'\"]+",
)
SECRET_FILENAME = re.compile(
    r"(?i)((?:api[_-]?key|password|secret|token)[_-])[^\\/\s'\"]+",
)


class Status(StrEnum):
    VERIFIED = "PASS"
    FAIL = "FAIL"
    BLOCKED = "BLOCKED"


class ExitCode(IntEnum):
    VERIFIED = 0
    FAIL = 2
    BLOCKED = 3


@dataclass(frozen=True, slots=True)
class CliInputError(Exception):
    option_name: str
    reason: str

    @override
    def __str__(self) -> str:
        return f"{self.option_name} {self.reason}"


def option(arguments: Sequence[str], name: str, *, default: str | None = None) -> str | None:
    positions = tuple(index for index, value in enumerate(arguments) if value == name)
    if not positions:
        return default
    index = positions[-1]
    if index + 1 >= len(arguments) or arguments[index + 1].startswith("--"):
        raise CliInputError(name, "requires a value")
    return arguments[index + 1]


def required_option(arguments: Sequence[str], name: str) -> str:
    value = option(arguments, name)
    if value is None:
        raise CliInputError(name, "is required")
    return value


def has_flag(arguments: Sequence[str], name: str) -> bool:
    return name in arguments


def redact_secret_like(value: str) -> str:
    assigned = SECRET_ASSIGNMENT.sub(r"\g<1>[REDACTED]", value)
    return SECRET_FILENAME.sub(r"\g<1>[REDACTED]", assigned)


def runtime_attestation_key(environment_name: str, *, minimum_bytes: int) -> bytes | None:
    value = os.environ.get(environment_name)
    if value is None:
        return None
    encoded = value.encode()
    return encoded if len(encoded) >= minimum_bytes else None


def _command_artifact_reference(
    receipt_path: Path,
    reference: Mapping[str, JsonValue] | None,
) -> tuple[Path, str] | None:
    if reference is None or set(reference) != {"exit_code", "path", "sha256"}:
        return None
    relative_path = reference.get("path")
    claimed_sha256 = reference.get("sha256")
    if (
        not isinstance(relative_path, str)
        or not isinstance(claimed_sha256, str)
        or reference.get("exit_code") != 0
    ):
        return None
    receipt_directory = receipt_path.parent.resolve()
    artifact_path = (receipt_directory / relative_path).resolve()
    if not artifact_path.is_relative_to(receipt_directory) or not artifact_path.is_file():
        return None
    return artifact_path, claimed_sha256


def _load_command_transcript(path: Path) -> tuple[Mapping[str, JsonValue], bytes] | None:
    try:
        artifact_bytes = path.read_bytes()
        loaded = decode_json(artifact_bytes.decode())
    except (json.JSONDecodeError, UnicodeError, OSError):
        return None
    transcript = loaded if isinstance(loaded, Mapping) else None
    if transcript is None:
        return None
    return transcript, artifact_bytes


def _transcript_evidence(
    transcript: Mapping[str, JsonValue],
    *,
    transcript_version: str,
) -> Mapping[str, JsonValue] | None:
    if set(transcript) != {"argv", "exit_code", "schema_version", "stderr", "stdout"}:
        return None
    argv = transcript.get("argv")
    stdout = transcript.get("stdout")
    stderr = transcript.get("stderr")
    if (
        not isinstance(argv, list)
        or not argv
        or not all(isinstance(item, str) for item in argv)
        or not isinstance(stdout, str)
        or not isinstance(stderr, str)
        or transcript.get("schema_version") != transcript_version
        or transcript.get("exit_code") != 0
    ):
        return None
    try:
        loaded = decode_json(stdout)
    except json.JSONDecodeError:
        return None
    return loaded if isinstance(loaded, Mapping) else None


def valid_command_artifact(
    receipt_path: Path,
    reference: Mapping[str, JsonValue] | None,
    *,
    evidence: Mapping[str, JsonValue],
    transcript_version: str,
) -> bool:
    artifact_reference = _command_artifact_reference(receipt_path, reference)
    if artifact_reference is None:
        return False
    artifact_path, claimed_sha256 = artifact_reference
    loaded = _load_command_transcript(artifact_path)
    if loaded is None:
        return False
    transcript, artifact_bytes = loaded
    observed_evidence = _transcript_evidence(
        transcript,
        transcript_version=transcript_version,
    )
    actual_sha256 = f"sha256:{hashlib.sha256(artifact_bytes).hexdigest()}"
    return observed_evidence == evidence and hmac.compare_digest(claimed_sha256, actual_sha256)


def write_json(path: Path, payload: Mapping[str, JsonValue]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f".{path.name}.tmp")
    _ = temporary.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    _ = temporary.replace(path)


def report_exit(status: Status) -> ExitCode:
    return ExitCode[status.name]
