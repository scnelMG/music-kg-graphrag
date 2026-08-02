from __future__ import annotations

import hashlib
import re
from pathlib import Path
from typing import Final

from .contracts.validate import validate_manifest
from .graphrag_models import QuestionClass, VersionMetadata
from .query_templates import GRAPH_SNAPSHOT_ID

MAX_EVIDENCE_RECORDS: Final = 12
MAX_INPUT_TOKENS: Final = 3_500
MAX_CLAIMS: Final = 8
MAX_LATENCY_MS: Final = 8_000
MAX_ESTIMATED_COST_USD: Final = "0.030000"
FIXTURE_MANIFEST: Final = (
    Path(__file__).resolve().parents[2] / "data" / "fixtures" / "manifest.json"
)
APPROVED_EVIDENCE_HASHES: Final = {
    "evidence:exact-album-facts-001": (
        "sha256:ec62ea9b8abaa6c43fb6b80536549786624e84cb884dfc7433b6c0f6ec364d89"
    ),
    "evidence:preference-path-a": (
        "sha256:af9c3d0a7b680668babc6bf975193ea3e348b802a20e7be58f08597bde67a4d9"
    ),
    "evidence:preference-path-b": (
        "sha256:5d4d0bd3a480d013e2b61b1b7e992de887b203b94ccbad9c8877ce1622b0ef21"
    ),
    "evidence:review-context-001": (
        "sha256:bd6d0fd915e77918ccb6a760b3f15a3224410a2d12245d821675d804bef4a322"
    ),
    "evidence:similar-candidate-001": (
        "sha256:5d17ec9a7c3c9ad819d38910f28665a16bce12487e1f333b0c0f3e598bd777c9"
    ),
}
APPROVED_CLAIMS_BY_EVIDENCE: Final[dict[tuple[str, ...], frozenset[str]]] = {
    ("evidence:exact-album-facts-001",): frozenset(
        {"Crumbling is tagged as folktronica."},
    ),
    ("evidence:similar-candidate-001",): frozenset(
        {
            "World of Sleepers connects to Crumbling through folktronica.",
            "World of Sleepers shares a folktronica path with Crumbling.",
        },
    ),
    ("evidence:preference-path-a", "evidence:preference-path-b"): frozenset(
        {"The sources disagree on the genre label."},
    ),
}
POLICY_VERSIONS: Final = VersionMetadata(
    system_prompt="evidence-bound-system-prompt/1.0.0",
    output_schema="graph-answer-schema/1.0.0",
    provider_config="fixture-json-provider/1.0.0:model=deterministic:no-tools",
    retrieval_policy="typed-allowlist-prune/1.0.0",
    graph_snapshot=GRAPH_SNAPSHOT_ID,
)
ROUTES: Final = {
    QuestionClass.FACTUAL_LOOKUP: frozenset({"exact_album_facts", "candidate_identity"}),
    QuestionClass.MOOD_CONTEXT_RECOMMENDATION: frozenset(
        {"review_contexts", "similar_candidates"},
    ),
    QuestionClass.RECOMMENDATION_RATIONALE: frozenset(
        {"preference_paths", "similar_candidates"},
    ),
    QuestionClass.TASTE_SUMMARY: frozenset({"preference_paths", "review_contexts"}),
}
_INSTRUCTION_OVERRIDE: Final = (
    r"(?:ignore|disregard|override)\s+(?:all\s+)?(?:prior|previous|system)\s+instructions|"
)
_SENSITIVE_EXFILTRATION: Final = r"(?:reveal|export|print)\s+(?:hidden|system|secret)"
INJECTION_PATTERN: Final = re.compile(
    f"{_INSTRUCTION_OVERRIDE}{_SENSITIVE_EXFILTRATION}",
    re.IGNORECASE,
)


def current_fixture_checksum() -> str | None:
    if validate_manifest(FIXTURE_MANIFEST).status != "PASSED":
        return None
    return f"sha256:{hashlib.sha256(FIXTURE_MANIFEST.read_bytes()).hexdigest()}"
