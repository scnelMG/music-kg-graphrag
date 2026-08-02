from __future__ import annotations

from .graphrag_models import (
    AnswerStatus,
    EvidenceItem,
    FailureCode,
    GraphAnswer,
    GraphRagError,
    Scenario,
)
from .graphrag_policy import APPROVED_CLAIMS_BY_EVIDENCE, MAX_CLAIMS


def validate_answer(scenario: Scenario, answer: GraphAnswer) -> None:
    if any(
        forbidden.casefold() in answer.answer.casefold()
        for forbidden in scenario.forbidden_claims
    ):
        raise GraphRagError(FailureCode.FORBIDDEN_CLAIM, scenario.scenario_id, "answer")
    if answer.status is AnswerStatus.REFUSED and (answer.answer or answer.claims):
        raise GraphRagError(
            FailureCode.INVALID_OUTPUT_SCHEMA,
            scenario.scenario_id,
            "refusal",
        )
    if answer.status is not AnswerStatus.REFUSED and not answer.claims:
        raise GraphRagError(
            FailureCode.MISSING_EVIDENCE_ID,
            scenario.scenario_id,
            "answer",
        )
    constructed_answer = " ".join(claim.text for claim in answer.claims)
    if answer.status is not AnswerStatus.REFUSED and answer.answer != constructed_answer:
        raise GraphRagError(
            FailureCode.INVALID_OUTPUT_SCHEMA,
            scenario.scenario_id,
            "answer",
        )


def validate_claims(
    scenario: Scenario,
    selected: tuple[EvidenceItem, ...],
    answer: GraphAnswer,
) -> None:
    if len(answer.claims) > MAX_CLAIMS:
        raise GraphRagError(FailureCode.CLAIM_LIMIT_EXCEEDED, scenario.scenario_id, "claims")
    evidence_ids = {evidence.evidence_id for evidence in selected}
    candidates = {candidate for evidence in selected for candidate in evidence.candidate_ids}
    for claim in answer.claims:
        if not claim.evidence_ids or not set(claim.evidence_ids).issubset(evidence_ids):
            raise GraphRagError(
                FailureCode.MISSING_EVIDENCE_ID,
                scenario.scenario_id,
                claim.claim_id,
            )
        if claim.candidate_id is not None and claim.candidate_id not in candidates:
            raise GraphRagError(
                FailureCode.CANDIDATE_NOT_RETRIEVED,
                scenario.scenario_id,
                claim.claim_id,
            )
        cited_evidence = tuple(
            evidence for evidence in selected if evidence.evidence_id in claim.evidence_ids
        )
        if claim.candidate_id is not None and any(
            claim.candidate_id not in evidence.candidate_ids for evidence in cited_evidence
        ):
            raise GraphRagError(
                FailureCode.CANDIDATE_NOT_RETRIEVED,
                scenario.scenario_id,
                claim.claim_id,
            )
        if any(
            forbidden.casefold() in claim.text.casefold()
            for forbidden in scenario.forbidden_claims
        ):
            raise GraphRagError(FailureCode.FORBIDDEN_CLAIM, scenario.scenario_id, claim.claim_id)


def validate_semantic_support(scenario: Scenario, answer: GraphAnswer) -> None:
    for claim in answer.claims:
        evidence_key = tuple(sorted(claim.evidence_ids))
        if claim.text not in APPROVED_CLAIMS_BY_EVIDENCE.get(evidence_key, frozenset()):
            raise GraphRagError(
                FailureCode.INVALID_OUTPUT_SCHEMA,
                scenario.scenario_id,
                claim.claim_id,
            )


def validate_contradictions(
    scenario: Scenario,
    selected: tuple[EvidenceItem, ...],
    answer: GraphAnswer,
) -> None:
    values: dict[str, set[str]] = {}
    for evidence in selected:
        if evidence.contradiction_key is not None and evidence.contradiction_value is not None:
            values.setdefault(evidence.contradiction_key, set()).add(evidence.contradiction_value)
    contradictory = any(len(items) > 1 for items in values.values())
    uncertainty_explicit = answer.status is AnswerStatus.UNCERTAIN and any(
        claim.uncertainty for claim in answer.claims
    )
    if contradictory and not uncertainty_explicit:
        raise GraphRagError(
            FailureCode.CONTRADICTION_UNACKNOWLEDGED,
            scenario.scenario_id,
            "uncertainty",
        )


def validate_expected(scenario: Scenario, answer: GraphAnswer) -> None:
    if scenario.expected_status is not AnswerStatus.REFUSED:
        if answer.status is AnswerStatus.REFUSED:
            raise GraphRagError(
                FailureCode.INCORRECT_REFUSAL,
                scenario.scenario_id,
                "status",
            )
    else:
        if answer.status is not AnswerStatus.REFUSED:
            raise GraphRagError(
                FailureCode.EXPECTED_REFUSAL_MISSING,
                scenario.scenario_id,
                "status",
            )
        if answer.refusal_reason != scenario.expected_refusal_reason:
            raise GraphRagError(
                FailureCode.EXPECTED_REFUSAL_MISSING,
                scenario.scenario_id,
                "reason",
            )
    if answer.status is not scenario.expected_status:
        raise GraphRagError(FailureCode.INVALID_OUTPUT_SCHEMA, scenario.scenario_id, "status")
