from __future__ import annotations

import hashlib
from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class EmbeddingIdentity:
    evidence_id: str
    content_hash: str
    provider: str
    model: str
    dimension: int
    normalisation: str
    policy_version: str
    embedding_version: str


def embedding_version_key(identity: EmbeddingIdentity) -> str:
    material = "\0".join(
        (
            identity.evidence_id,
            identity.content_hash,
            identity.provider,
            identity.model,
            str(identity.dimension),
            identity.normalisation,
            identity.policy_version,
            identity.embedding_version,
        ),
    ).encode()
    return f"embedding:{hashlib.sha256(material).hexdigest()}"
