# AI Practitioner Review: Music KG GraphRAG

## Verdict

The plan should be framed as an **evidence-first personal decision-support system**, not an ML recommender project. With one user's sparse album history, the immediate value comes from clean identity resolution, transparent candidate ranking, and trustworthy explanation. A learned recommender or a GraphRAG indexing framework is not justified until the deterministic baseline and its evaluation corpus prove a limitation.

The improvement plan remains correct, but this review makes five AI-specific changes binding:

1. separate retrieval, ranking, generation, and evaluation as independently measurable modules;
2. use heuristic/graph ranking before training any model;
3. treat the LLM as a constrained explanation renderer, never as a candidate generator or evidence authority;
4. gate every prompt, model, embedding, or ranking-policy change with a versioned evaluation diff;
5. measure usefulness, faithfulness, latency, and cost separately instead of reporting a single “AI score.”

## What an AI practitioner would change

| Area | Current risk | Required decision |
| --- | --- | --- |
| Problem definition | “Recommendation” is too broad for a single-user sparse dataset. | Define success as: a user can inspect a recommendation, trace why it appeared, and reject it when there is insufficient evidence. Do not promise prediction accuracy or personalization at scale. |
| Candidate generation | LLM/vector similarity could become an opaque first step. | Generate candidates deterministically from typed graph paths, lexical metadata search, and an explicit exclusion list. The LLM must never introduce an album absent from the candidate set. |
| Ranking | A learned ranker would overfit a tiny history. | Begin with declared, versioned weights: personal evidence, path strength, metadata relevance, novelty/diversity penalty, and already-reviewed exclusion. Keep the score decomposition in the response. |
| Embeddings | Embedding work is prematurely treated as a feature. | Add vectors only after a fixed lexical/graph baseline and a curated retrieval test set exist. Version the text input, provider, model, dimension, normalization, and index configuration. Re-embed on a content-hash change, never silently. |
| Generation | Citations can be decorative while the prose adds unsupported claims. | Generate only from structured evidence records; sentence-level support must map to evidence IDs. On incomplete support, return a bounded answer or `INSUFFICIENT_EVIDENCE`. |
| Evaluation | A 30–50 album fixture cannot support a statistical product-quality claim. | Use it as a deterministic regression corpus and qualitative review instrument. Maintain a separate, hand-authored golden set of questions, expected evidence, allowed claims, forbidden claims, and expected refusal. |
| LLM-as-judge | Judge-based metrics can drift with the evaluator model/prompt. | Use exact/path assertions as the release blocker. Use Ragas/LLM-as-judge only as supplementary diagnostics, pinning judge model/prompt and sampling human review. |
| Operations | Quality changes can be hidden behind provider/model swaps. | Version prompts, model settings, retrieval policy, graph snapshot, and embeddings; record latency, token/cost estimate, cache outcome, and evaluation version for every run. |

## Recommended AI maturity ladder

### Level 0 — Data and evidence, no generative behavior

Deliver source-qualified entities, review assertions, named-graph provenance, SHACL reports, deterministic SPARQL queries, and an owner-reviewed fixture dataset. This is the product's factual foundation.

**Exit proof:** every fixture assertion has a stable ID and source; invalid assertions fail validation; every supported question retrieves the expected witness path.

### Level 1 — Deterministic recommendation baseline

Use graph/metadata candidate generation plus a transparent weighted score. The API returns score components and exclusion reasons, not an LLM narrative.

**Exit proof:** a versioned golden set proves candidate recall, evidence-path correctness, duplicate suppression, already-reviewed exclusion, and no-evidence behavior. Track diversity/novelty as diagnostics, not optimization claims.

### Level 2 — Versioned hybrid retrieval

Only if the Level 1 error analysis shows semantic recall gaps, add pgvector as a candidate-retrieval signal. Compare lexical+graph, vector-only, and fused retrieval against the same golden set. Exact search is the benchmark; approximate indexing must demonstrate recall and latency trade-offs before release.

**Exit proof:** retrieval Recall@K/evidence-path recall does not regress against the baseline; ANN recall is measured versus exact search; each embedding and fusion policy is reproducible from its run metadata.

### Level 3 — Constrained answer generation

Feed the LLM only a typed evidence bundle: candidate ID, relation path, source IDs, scores, and bounded review snippets. Require structured output that references the supplied evidence IDs. Do not allow tool use, arbitrary web fetch, text-to-SPARQL, or write actions on this path.

**Exit proof:** supported answers cite valid evidence; unsupported, adversarial, contradictory, and poisoned-context cases refuse or state uncertainty. Human spot review checks claim-to-evidence alignment.

### Level 4 — Continuous evaluation and portfolio demonstration

Run evaluation for every change to data, prompts, embeddings, ranking weights, or providers. Present metrics and failure cases in the portfolio demo; do not bury them behind a polished UI.

**Exit proof:** immutable evaluation artifact includes configuration, graph snapshot, fixture checksum, per-case output, evidence trace, exact assertions, latency, and estimated cost.

## Evaluation contract

Keep one row per golden scenario with these fields:

`scenario_id`, `question_class`, `input`, `allowed_candidate_ids`, `required_evidence_ids`, `forbidden_claims`, `expected_status`, `expected_refusal_reason`, `graph_snapshot_id`, and `fixture_version`.

Evaluate four layers separately:

| Layer | Release-blocking metric | Supplementary diagnostic |
| --- | --- | --- |
| Entity/path retrieval | required evidence-path recall; forbidden-entity exclusion | Recall@K, MRR |
| Candidate ranking | allowed candidate appears in top K; already-reviewed item excluded | diversity, novelty, genre/artist calibration |
| Generated answer | every claim maps to an evidence ID; correct no-evidence/refusal behavior | faithfulness, answer relevance, context precision/recall |
| System operation | deterministic result for fixed config; budget/latency ceiling | cache hit ratio, provider errors, retry rate |

Ragas and ARES are useful tools for diagnostic faithfulness/context metrics, but they must not replace a hand-authored witness-path oracle for this small KG. Ragas itself treats evaluation as dataset-driven; ARES requires human-labeled validation examples. [Ragas evaluation workflow](https://github.com/vibrantlabsai/ragas/blob/master/docs/howtos/applications/evaluate-and-improve-rag.md), [ARES](https://github.com/stanford-futuredata/ARES).

## AI risk controls

- **Data leakage:** evaluation examples are frozen before changing retrieval/ranking; never tune against their expected answers and call the result generalization.
- **Feedback loop:** store user feedback separately as `accepted`, `rejected`, or `not-enough-evidence`; do not silently reinterpret a rating as a recommendation label.
- **Prompt injection/poisoning:** treat external metadata and review text as data. Validate source/provenance before projection; keep generator authority read-only and reject instructions found in retrieved content.
- **Evaluation drift:** pin evaluator prompt/model; retain raw outputs and exact rule-check reports. A judge score alone cannot approve a release.
- **Cost/latency drift:** every evaluation report includes model/provider, input-token count or estimate, latency, cache state, and retry count. Establish a budget before enabling optional generation.
- **Human factors:** show confidence as evidence coverage, not as a synthetic probability unless calibrated against real labeled outcomes.

## Changes to the execution plan

Insert these gates before the current retrieval/GraphRAG work:

1. Create `docs/ai-evaluation-contract.md` and a versioned fixture/golden-set format before embedding or LLM work.
2. Implement graph/lexical candidate generation and explainable score decomposition before pgvector.
3. Add embedding only after baseline error analysis; retain exact-search comparison and full embedding lineage.
4. Add structured evidence-bundle generation with deterministic schema validation before prose generation.
5. Add an evaluation command that fails on required-evidence loss, forbidden claims, incorrect refusal, non-deterministic run metadata, budget breach, or missing trace fields.

These decisions follow the NIST GenAI profile's emphasis on governing, mapping, measuring, and managing AI risks, and current practitioner guidance to run evals across consistency, latency, and cost before release. [NIST AI RMF GenAI Profile](https://www.nist.gov/publications/artificial-intelligence-risk-management-framework-generative-artificial-intelligence), [OpenAI deployment guide](https://cdn.openai.com/business-guides-and-resources/from-experiments-to-deployments_whitepaper_11-25.pdf).
