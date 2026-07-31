from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Final, Literal
from urllib.parse import urlparse


VALID_CLASSES: Final[frozenset[str]] = frozenset({"PUBLIC_FIXTURE", "UNTRUSTED_TEXT"})
ALLOWED_HOSTS: Final[frozenset[str]] = frozenset({"musicbrainz.org", "coverartarchive.org"})
SECRET_PATTERN: Final[re.Pattern[str]] = re.compile(
    r"(?:sk-[A-Za-z0-9_-]{12,}|secret|token|api[_-]?key|password)", re.IGNORECASE
)
PLACEHOLDER_PATTERN: Final[re.Pattern[str]] = re.compile(r"replace-with|placeholder|example-user-agent", re.IGNORECASE)


@dataclass(frozen=True, slots=True)
class ValidationResult:
    status: Literal["PASSED", "FAILED"]
    error_codes: tuple[str, ...]
    network_calls: Literal[0]
    album_count: int
    review_count: int
    manifest: str


def _load_json(path: Path) -> dict[str, object]:
    loaded = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(loaded, dict):
        raise TypeError(f"Expected JSON object in {path}")
    return loaded


def _as_records(value: object) -> list[dict[str, object]]:
    if not isinstance(value, list):
        return []
    return [item for item in value if isinstance(item, dict)]


def _checksum(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _contains_secret(value: object) -> bool:
    match value:
        case str():
            return SECRET_PATTERN.search(value) is not None
        case list():
            return any(_contains_secret(item) for item in value)
        case dict():
            return any(_contains_secret(item) for item in value.values())
        case _:
            return False


def _is_allowed_provider_url(value: object) -> bool:
    if not isinstance(value, str):
        return False
    parsed = urlparse(value)
    return parsed.scheme == "https" and parsed.hostname in ALLOWED_HOSTS


def _validate_manifest(manifest: dict[str, object], manifest_path: Path) -> tuple[list[str], int, int]:
    errors: list[str] = []
    notion = manifest.get("notion_mapping")
    if not isinstance(notion, dict) or notion.get("approval_status") != "UNCONFIGURED" or notion.get(
        "live_import_write_forbidden"
    ) is not True:
        errors.append("NOTION_MAPPING_UNCONFIGURED")
    elif set(notion.get("property_ids", {})) - {"title", "artist", "rating", "review"}:
        errors.append("UNKNOWN_NOTION_PROPERTY")

    provider_policy = manifest.get("provider_policy")
    if not isinstance(provider_policy, dict):
        errors.append("UNAPPROVED_PROVIDER_HOST")
    else:
        user_agent = provider_policy.get("musicbrainz_user_agent")
        if not isinstance(user_agent, str) or PLACEHOLDER_PATTERN.search(user_agent):
            errors.append("PLACEHOLDER_USER_AGENT")
        endpoints = provider_policy.get("endpoints")
        if not isinstance(endpoints, list) or not all(_is_allowed_provider_url(item) for item in endpoints):
            errors.append("UNAPPROVED_PROVIDER_HOST")
        if provider_policy.get("fixture_mode") != "disabled":
            errors.append("REAL_PROVIDER_EGRESS_FORBIDDEN")
        if provider_policy.get("llm_egress") != "forbidden":
            errors.append("LLM_EGRESS_FORBIDDEN")

    classifications = manifest.get("data_classification")
    if not isinstance(classifications, dict) or not set(classifications.values()) <= VALID_CLASSES:
        errors.append("UNDEFINED_DATA_CLASS")
    if _contains_secret(manifest):
        errors.append("SECRET_LIKE_VALUE")

    files = manifest.get("fixture_files")
    albums: list[dict[str, object]] = []
    reviews: list[dict[str, object]] = []
    if not isinstance(files, dict):
        errors.append("INVALID_CHECKSUM")
    else:
        for collection, target in (("albums", albums), ("reviews", reviews)):
            descriptor = files.get(collection)
            if not isinstance(descriptor, dict):
                errors.append("INVALID_CHECKSUM")
                continue
            relative_path = descriptor.get("path")
            expected_hash = descriptor.get("sha256")
            if not isinstance(relative_path, str) or not isinstance(expected_hash, str):
                errors.append("INVALID_CHECKSUM")
                continue
            fixture_path = manifest_path.parent / relative_path
            if not fixture_path.is_file() or _checksum(fixture_path) != expected_hash:
                errors.append("INVALID_CHECKSUM")
                continue
            target.extend(_as_records(_load_json(fixture_path).get(collection)))

    for record in [*albums, *reviews]:
        if not isinstance(record.get("stable_id"), str) or not record["stable_id"]:
            errors.append("MISSING_STABLE_ID")
        if record.get("data_class") not in VALID_CLASSES:
            errors.append("UNDEFINED_DATA_CLASS")
    return errors, len(albums), len(reviews)


def _mutated_manifest(manifest: dict[str, object], mutation: str) -> dict[str, object]:
    cloned = json.loads(json.dumps(manifest))
    policy = cloned["provider_policy"]
    match mutation:
        case "placeholder_user_agent":
            policy["musicbrainz_user_agent"] = "replace-with-email"
        case "unknown_notion_property":
            cloned["notion_mapping"]["property_ids"]["unknown"] = "UNCONFIGURED"
        case "unknown_provider_host":
            policy["endpoints"] = ["https://evil.invalid"]
        case "secret_looking_value":
            cloned["display_note"] = "sk-example-secret-value"
        case "invalid_checksum":
            cloned["fixture_files"]["albums"]["sha256"] = "0" * 64
        case "missing_stable_id":
            return _record_mutation(cloned, "stable_id", "")
        case "undefined_data_class":
            return _record_mutation(cloned, "data_class", "PERSONAL")
        case "real_provider_egress":
            policy["fixture_mode"] = "enabled"
        case "llm_egress":
            policy["llm_egress"] = "enabled"
        case _:  # noqa: MATCH_OK
            raise KeyError(mutation)
    return cloned


def _record_mutation(manifest: dict[str, object], key: str, value: str) -> dict[str, object]:
    return manifest | {"test_record_override": {key: value}}


def validate_manifest(manifest_path: Path, mutation: str | None = None) -> ValidationResult:
    try:
        manifest = _load_json(manifest_path)
    except json.JSONDecodeError:
        return ValidationResult(
            status="FAILED",
            error_codes=("MALFORMED_CONTRACT",),
            network_calls=0,
            album_count=0,
            review_count=0,
            manifest=str(manifest_path),
        )
    selected = _mutated_manifest(manifest, mutation) if mutation is not None else manifest
    errors, albums, reviews = _validate_manifest(selected, manifest_path)
    override = selected.get("test_record_override")
    if isinstance(override, dict):
        if override.get("stable_id") == "":
            errors.append("MISSING_STABLE_ID")
        if override.get("data_class") == "PERSONAL":
            errors.append("UNDEFINED_DATA_CLASS")
    unique_errors = tuple(sorted(set(errors)))
    return ValidationResult(
        status="FAILED" if unique_errors else "PASSED",
        error_codes=unique_errors,
        network_calls=0,
        album_count=albums,
        review_count=reviews,
        manifest=str(manifest_path),
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Validate fixture-only Music KG contracts without network access.")
    parser.add_argument("--manifest", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    arguments = parser.parse_args()
    result = validate_manifest(arguments.manifest)
    arguments.output.parent.mkdir(parents=True, exist_ok=True)
    arguments.output.write_text(json.dumps(asdict(result), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    if result.status == "FAILED":
        print(" ".join(result.error_codes), file=sys.stderr)
        raise SystemExit(1)


if __name__ == "__main__":
    main()
