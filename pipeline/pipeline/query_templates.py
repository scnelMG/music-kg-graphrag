from __future__ import annotations

import hashlib
from dataclasses import dataclass
from pathlib import Path
from typing import Final

from .query_models import BindingType, QueryCode, QueryRequestError, SuiteCase

MAX_HOPS: Final = 3
MAX_ROWS: Final = 100
TIMEOUT_MS: Final = 1_000
TEMPLATE_VERSION: Final = "1.0.0"
SOURCE_ID: Final = "source:musicbrainz"
GRAPH_SNAPSHOT_ID: Final = (
    "https://w3id.org/music-kg-graphrag/graph/musicbrainz/generation/fixture-20260731"
)
RETRIEVAL_RUN_ID: Final = "run:fixture-20260731"
ALLOWED_RELATIONS: Final = frozenset(
    {"createdBy", "hasGenre", "hasListeningContext", "targetReleaseGroup"},
)
KNOWN_ENTITIES: Final = {
    BindingType.FESTIVAL_ID: frozenset({"festival:seoul-2026"}),
    BindingType.RELEASE_GROUP_ID: frozenset(
        {"release-group:crumbling", "release-group:world-of-sleepers"},
    ),
    BindingType.REVIEW_ID: frozenset({"review:crumbling-fixture"}),
}


@dataclass(frozen=True, slots=True)
class TemplateSpec:
    name: str
    query_path: Path
    required_bindings: tuple[tuple[str, BindingType], ...]
    hops: int
    path_fields: tuple[str, ...]
    evidence_id: str
    score: str
    row_limit: int = MAX_ROWS
    timeout_ms: int = TIMEOUT_MS

    @property
    def query_hash(self) -> str:
        return f"sha256:{hashlib.sha256(self.query_path.read_bytes()).hexdigest()}"


_QUERY_ROOT = Path(__file__).resolve().parents[2] / "queries" / "templates"
TEMPLATES: Final = (
    TemplateSpec(
        "exact_album_facts",
        _QUERY_ROOT / "exact_album_facts.rq",
        (("release_group", BindingType.RELEASE_GROUP_ID),),
        2,
        ("release_group", "assertion", "value"),
        "evidence:exact-album-facts-001",
        "0.970000",
    ),
    TemplateSpec(
        "candidate_identity",
        _QUERY_ROOT / "candidate_identity.rq",
        (("candidate", BindingType.RELEASE_GROUP_ID),),
        2,
        ("candidate", "release", "externalId"),
        "evidence:candidate-identity-001",
        "1.000000",
    ),
    TemplateSpec(
        "review_contexts",
        _QUERY_ROOT / "review_contexts.rq",
        (("review", BindingType.REVIEW_ID),),
        1,
        ("review", "context"),
        "evidence:review-context-001",
        "1.000000",
    ),
    TemplateSpec(
        "preference_paths",
        _QUERY_ROOT / "preference_paths.rq",
        (
            ("origin", BindingType.RELEASE_GROUP_ID),
            ("relation", BindingType.RELATION),
        ),
        3,
        ("origin", "relation", "shared", "candidate"),
        "evidence:preference-path-001",
        "0.920000",
    ),
    TemplateSpec(
        "similar_candidates",
        _QUERY_ROOT / "similar_candidates.rq",
        (
            ("origin", BindingType.RELEASE_GROUP_ID),
            ("relation", BindingType.RELATION),
        ),
        2,
        ("origin", "relation", "shared", "candidate"),
        "evidence:similar-candidate-001",
        "0.890000",
    ),
    TemplateSpec(
        "already_reviewed_exclusions",
        _QUERY_ROOT / "already_reviewed_exclusions.rq",
        (("candidate", BindingType.RELEASE_GROUP_ID),),
        1,
        ("candidate", "review"),
        "evidence:already-reviewed-001",
        "1.000000",
    ),
    TemplateSpec(
        "festival_prep",
        _QUERY_ROOT / "festival_prep.rq",
        (("festival", BindingType.FESTIVAL_ID),),
        3,
        ("festival", "artist", "candidate", "release"),
        "evidence:festival-prep-001",
        "0.940000",
    ),
)
TEMPLATE_NAMES: Final = tuple(template.name for template in TEMPLATES)


def template_for(case_id: str, name: str) -> TemplateSpec:
    for template in TEMPLATES:
        if template.name == name:
            return template
    raise QueryRequestError(QueryCode.UNKNOWN_TEMPLATE, case_id, name)


def validate_case(case: SuiteCase) -> TemplateSpec:
    template = template_for(case.case_id, case.template_name)
    if case.row_limit > min(template.row_limit, MAX_ROWS):
        raise QueryRequestError(QueryCode.ROW_LIMIT_EXCEEDED, case.case_id, str(case.row_limit))
    if case.timeout_ms > min(template.timeout_ms, TIMEOUT_MS):
        raise QueryRequestError(
            QueryCode.TIMEOUT_LIMIT_EXCEEDED,
            case.case_id,
            str(case.timeout_ms),
        )
    if case.hops > min(template.hops, MAX_HOPS):
        raise QueryRequestError(QueryCode.HOP_LIMIT_EXCEEDED, case.case_id, str(case.hops))
    supplied = tuple((binding.name, binding.binding_type) for binding in case.bindings)
    if supplied != template.required_bindings:
        raise QueryRequestError(QueryCode.BINDING_TYPE_REQUIRED, case.case_id, str(supplied))
    for binding in case.bindings:
        if binding.binding_type is BindingType.RELATION:
            if binding.value not in ALLOWED_RELATIONS:
                raise QueryRequestError(
                    QueryCode.UNSUPPORTED_RELATION,
                    case.case_id,
                    str(binding.value),
                )
            continue
        if binding.binding_type is BindingType.HOPS:
            continue
        known = KNOWN_ENTITIES.get(binding.binding_type, frozenset())
        if binding.value not in known:
            raise QueryRequestError(QueryCode.UNKNOWN_ENTITY, case.case_id, str(binding.value))
    return template
