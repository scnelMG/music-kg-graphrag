from __future__ import annotations

from decimal import Decimal, InvalidOperation
from typing import TYPE_CHECKING

from .graphrag_models import (
    AnswerStatus,
    EvidenceItem,
    FailureCode,
    GraphAnswer,
    GraphRagError,
    QuestionClass,
    Scenario,
    ScenarioResult,
    VersionMetadata,
)
from .graphrag_output import parse_provider_output
from .graphrag_policy import (
    APPROVED_EVIDENCE_HASHES,
    INJECTION_PATTERN,
    MAX_ESTIMATED_COST_USD,
    MAX_EVIDENCE_RECORDS,
    MAX_INPUT_TOKENS,
    MAX_LATENCY_MS,
    POLICY_VERSIONS,
    ROUTES,
    current_fixture_checksum,
)
from .graphrag_validation import (
    validate_answer,
    validate_claims,
    validate_contradictions,
    validate_expected,
    validate_semantic_support,
)
from .query_oracles import canonical_hash

if TYPE_CHECKING:
    from .query_models import JsonValue


def _refusal(scenario: Scenario, code: FailureCode) -> GraphAnswer:
    return GraphAnswer(
        status=AnswerStatus.REFUSED,
        question_class=scenario.question_class,
        answer="",
        claims=(),
        refusal_reason=str(code),
        metadata=POLICY_VERSIONS,
    )


def _validate_versions(
    actual: VersionMetadata,
    scenario_id: str,
) -> None:
    checks = (
        (
            actual.system_prompt == POLICY_VERSIONS.system_prompt,
            FailureCode.SYSTEM_PROMPT_VERSION_MISMATCH,
        ),
        (
            actual.output_schema == POLICY_VERSIONS.output_schema,
            FailureCode.OUTPUT_SCHEMA_VERSION_MISMATCH,
        ),
        (
            actual.provider_config == POLICY_VERSIONS.provider_config,
            FailureCode.PROVIDER_CONFIG_VERSION_MISMATCH,
        ),
        (
            actual.retrieval_policy == POLICY_VERSIONS.retrieval_policy,
            FailureCode.RETRIEVAL_POLICY_VERSION_MISMATCH,
        ),
        (
            actual.graph_snapshot == POLICY_VERSIONS.graph_snapshot,
            FailureCode.GRAPH_SNAPSHOT_VERSION_MISMATCH,
        ),
    )
    for matches, code in checks:
        if not matches:
            raise GraphRagError(code, scenario_id, "version")


def _content_hash(evidence: EvidenceItem) -> str:
    payload: dict[str, JsonValue] = {
        "candidate_ids": list(evidence.candidate_ids),
        "contradiction_key": evidence.contradiction_key,
        "contradiction_value": evidence.contradiction_value,
        "evidence_id": evidence.evidence_id,
        "path": list(evidence.path),
        "route": evidence.route,
        "source_id": evidence.source_id,
        "text": evidence.text,
    }
    return canonical_hash(payload)


def _select_evidence(
    scenario: Scenario,
    question_class: QuestionClass,
) -> tuple[EvidenceItem, ...]:
    routes = ROUTES[question_class]
    selected = tuple(
        evidence
        for evidence in scenario.retrieval
        if evidence.route in routes
        and (
            not evidence.candidate_ids
            or set(evidence.candidate_ids).issubset(scenario.allowed_candidate_ids)
        )
    )
    return tuple(sorted(selected, key=lambda item: item.evidence_id)[:MAX_EVIDENCE_RECORDS])


def _validate_bounds(scenario: Scenario) -> None:
    if scenario.input_tokens > MAX_INPUT_TOKENS:
        raise GraphRagError(FailureCode.TOKEN_LIMIT_EXCEEDED, scenario.scenario_id, "tokens")
    if scenario.latency_ms > MAX_LATENCY_MS:
        raise GraphRagError(FailureCode.LATENCY_LIMIT_EXCEEDED, scenario.scenario_id, "latency")
    try:
        cost = Decimal(scenario.estimated_cost_usd)
    except (InvalidOperation, TypeError, ValueError) as error:
        raise GraphRagError(
            FailureCode.INVALID_OUTPUT_SCHEMA,
            scenario.scenario_id,
            "cost",
        ) from error
    if not cost.is_finite() or cost < 0:
        raise GraphRagError(
            FailureCode.INVALID_OUTPUT_SCHEMA,
            scenario.scenario_id,
            "cost",
        )
    if cost > Decimal(MAX_ESTIMATED_COST_USD):
        raise GraphRagError(FailureCode.COST_LIMIT_EXCEEDED, scenario.scenario_id, "cost")


def _validate_effective_tokens(
    scenario: Scenario,
    selected: tuple[EvidenceItem, ...],
) -> None:
    texts = (scenario.question, *(evidence.text for evidence in selected))
    effective_tokens = sum(
        max(len(text.split()), (len(text.encode("utf-8")) + 3) // 4)
        for text in texts
    )
    if effective_tokens > MAX_INPUT_TOKENS:
        raise GraphRagError(
            FailureCode.TOKEN_LIMIT_EXCEEDED,
            scenario.scenario_id,
            "effective_tokens",
        )


def _question_class(scenario: Scenario) -> QuestionClass:
    try:
        return QuestionClass(scenario.question_class)
    except ValueError as error:
        raise GraphRagError(
            FailureCode.UNSUPPORTED_QUESTION_CLASS,
            scenario.scenario_id,
            scenario.question_class,
        ) from error


def _validate_scenario_identity(scenario: Scenario) -> None:
    _validate_versions(scenario.versions, scenario.scenario_id)
    actual_checksum = current_fixture_checksum()
    if actual_checksum is None or scenario.fixture_checksum != actual_checksum:
        raise GraphRagError(
            FailureCode.FIXTURE_INTEGRITY_MISMATCH,
            scenario.scenario_id,
            "fixture_checksum",
        )


def _validate_retrieval(
    scenario: Scenario,
    selected: tuple[EvidenceItem, ...],
) -> int:
    selected_ids = {item.evidence_id for item in selected}
    required_ids = set(scenario.required_evidence_ids)
    matched = len(required_ids.intersection(selected_ids))
    if matched != len(required_ids):
        raise GraphRagError(FailureCode.MISSING_EVIDENCE_ID, scenario.scenario_id, "retrieval")
    for evidence in selected:
        if evidence.content_hash != _content_hash(evidence):
            raise GraphRagError(
                FailureCode.INVALID_OUTPUT_SCHEMA,
                scenario.scenario_id,
                evidence.evidence_id,
            )
        if APPROVED_EVIDENCE_HASHES.get(evidence.evidence_id) != evidence.content_hash:
            raise GraphRagError(
                FailureCode.FIXTURE_INTEGRITY_MISMATCH,
                scenario.scenario_id,
                evidence.evidence_id,
            )
        if INJECTION_PATTERN.search(evidence.text) is not None:
            raise GraphRagError(
                FailureCode.POISONED_CONTEXT,
                scenario.scenario_id,
                evidence.evidence_id,
            )
    return matched


def _evaluate_checked(
    scenario: Scenario,
) -> tuple[tuple[EvidenceItem, ...], int, GraphAnswer]:
    question_class = _question_class(scenario)
    _validate_scenario_identity(scenario)
    _validate_bounds(scenario)
    selected = _select_evidence(scenario, question_class)
    _validate_effective_tokens(scenario, selected)
    matched = _validate_retrieval(scenario, selected)
    answer = parse_provider_output(scenario.provider_output_json, scenario.scenario_id)
    _validate_versions(answer.metadata, scenario.scenario_id)
    if answer.question_class != scenario.question_class:
        raise GraphRagError(
            FailureCode.INVALID_OUTPUT_SCHEMA,
            scenario.scenario_id,
            "question_class",
        )
    validate_claims(scenario, selected, answer)
    validate_answer(scenario, answer)
    validate_contradictions(scenario, selected, answer)
    validate_semantic_support(scenario, answer)
    validate_expected(scenario, answer)
    return selected, matched, answer


def evaluate_scenario(scenario: Scenario) -> ScenarioResult:
    try:
        selected, matched, answer = _evaluate_checked(scenario)
    except GraphRagError as error:
        try:
            selected = _select_evidence(scenario, _question_class(scenario))
        except GraphRagError:
            selected = ()
        allowed = tuple(item.evidence_id for item in selected)
        matched = len(set(scenario.required_evidence_ids).intersection(allowed))
        return ScenarioResult(
            scenario_id=scenario.scenario_id,
            passed=False,
            failure_code=error.code,
            allowed_evidence_ids=allowed,
            selected_evidence_ids=tuple(item.evidence_id for item in selected),
            retrieval_required=len(set(scenario.required_evidence_ids)),
            retrieval_matched=matched,
            answer=_refusal(scenario, error.code),
        )
    allowed = tuple(item.evidence_id for item in selected)
    return ScenarioResult(
        scenario_id=scenario.scenario_id,
        passed=True,
        failure_code=None,
        allowed_evidence_ids=allowed,
        selected_evidence_ids=allowed,
        retrieval_required=len(set(scenario.required_evidence_ids)),
        retrieval_matched=matched,
        answer=answer,
    )
