from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum, unique
from typing import override


@unique
class QuestionClass(StrEnum):
    FACTUAL_LOOKUP = "FACTUAL_LOOKUP"
    MOOD_CONTEXT_RECOMMENDATION = "MOOD_CONTEXT_RECOMMENDATION"
    RECOMMENDATION_RATIONALE = "RECOMMENDATION_RATIONALE"
    TASTE_SUMMARY = "TASTE_SUMMARY"


@unique
class AnswerStatus(StrEnum):
    ANSWERED = "ANSWERED"
    REFUSED = "REFUSED"
    UNCERTAIN = "UNCERTAIN"


@unique
class FailureCode(StrEnum):
    CANDIDATE_NOT_RETRIEVED = "CANDIDATE_NOT_RETRIEVED"
    CLAIM_LIMIT_EXCEEDED = "CLAIM_LIMIT_EXCEEDED"
    CONTRADICTION_UNACKNOWLEDGED = "CONTRADICTION_UNACKNOWLEDGED"
    COST_LIMIT_EXCEEDED = "COST_LIMIT_EXCEEDED"
    EXPECTED_REFUSAL_MISSING = "EXPECTED_REFUSAL_MISSING"
    FIXTURE_INTEGRITY_MISMATCH = "FIXTURE_INTEGRITY_MISMATCH"
    FORBIDDEN_CLAIM = "FORBIDDEN_CLAIM"
    GRAPH_SNAPSHOT_VERSION_MISMATCH = "GRAPH_SNAPSHOT_VERSION_MISMATCH"
    INCORRECT_REFUSAL = "INCORRECT_REFUSAL"
    INVALID_JSON = "INVALID_JSON"
    INVALID_OUTPUT_SCHEMA = "INVALID_OUTPUT_SCHEMA"
    LATENCY_LIMIT_EXCEEDED = "LATENCY_LIMIT_EXCEEDED"
    METADATA_NONDETERMINISTIC = "METADATA_NONDETERMINISTIC"
    MISSING_EVIDENCE_ID = "MISSING_EVIDENCE_ID"
    OUTPUT_SCHEMA_VERSION_MISMATCH = "OUTPUT_SCHEMA_VERSION_MISMATCH"
    POISONED_CONTEXT = "POISONED_CONTEXT"
    PROVIDER_CONFIG_VERSION_MISMATCH = "PROVIDER_CONFIG_VERSION_MISMATCH"
    RETRIEVAL_POLICY_VERSION_MISMATCH = "RETRIEVAL_POLICY_VERSION_MISMATCH"
    SYSTEM_PROMPT_VERSION_MISMATCH = "SYSTEM_PROMPT_VERSION_MISMATCH"
    TOKEN_LIMIT_EXCEEDED = "TOKEN_LIMIT_EXCEEDED"  # noqa: S105 - typed error code
    UNSUPPORTED_QUESTION_CLASS = "UNSUPPORTED_QUESTION_CLASS"


@dataclass(frozen=True, slots=True)
class VersionMetadata:
    system_prompt: str
    output_schema: str
    provider_config: str
    retrieval_policy: str
    graph_snapshot: str


@dataclass(frozen=True, slots=True)
class EvidenceItem:
    evidence_id: str
    candidate_ids: tuple[str, ...]
    path: tuple[str, ...]
    route: str
    source_id: str
    text: str
    content_hash: str
    contradiction_key: str | None
    contradiction_value: str | None


@dataclass(frozen=True, slots=True)
class Claim:
    claim_id: str
    text: str
    candidate_id: str | None
    evidence_ids: tuple[str, ...]
    uncertainty: bool


@dataclass(frozen=True, slots=True)
class GraphAnswer:
    status: AnswerStatus
    question_class: str
    answer: str
    claims: tuple[Claim, ...]
    refusal_reason: str | None
    metadata: VersionMetadata


@dataclass(frozen=True, slots=True)
class Scenario:
    scenario_id: str
    question_class: str
    question: str
    allowed_candidate_ids: tuple[str, ...]
    required_evidence_ids: tuple[str, ...]
    forbidden_claims: tuple[str, ...]
    expected_status: AnswerStatus
    expected_refusal_reason: str | None
    fixture_checksum: str
    versions: VersionMetadata
    input_tokens: int
    latency_ms: int
    estimated_cost_usd: str
    retrieval: tuple[EvidenceItem, ...]
    provider_output_json: str


@dataclass(frozen=True, slots=True)
class GraphRagError(Exception):
    code: FailureCode
    scenario_id: str
    detail: str

    @override
    def __str__(self) -> str:
        return f"{self.code}: {self.scenario_id}: {self.detail}"


@dataclass(frozen=True, slots=True)
class ScenarioResult:
    scenario_id: str
    passed: bool
    failure_code: FailureCode | None
    allowed_evidence_ids: tuple[str, ...]
    selected_evidence_ids: tuple[str, ...]
    retrieval_required: int
    retrieval_matched: int
    answer: GraphAnswer
