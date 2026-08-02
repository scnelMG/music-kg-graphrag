# Constrained GraphRAG evaluation corpus

`graphrag-golden.jsonl` is the release-authority suite for separate retrieval recall and generation claim coverage. `graphrag-adversarial.jsonl` is intentionally rejected and covers evidence, candidate, claim, schema, routing, poisoning, contradiction, metadata, version, budget, and refusal failures.

Every case pins the fixture checksum, graph snapshot, system prompt, output schema, deterministic fixture-provider configuration, retrieval policy, allowed candidates, required evidence, forbidden claims, latency, and estimated cost. Retrieved `text` is untrusted data. Its `content_hash`, provenance path, typed route, and source ID are verifier inputs; it is never interpreted as an instruction.
