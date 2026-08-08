# Retrieval baseline error analysis

## Semantic recall miss

Policy `lexical-graph/1.0.0` retrieves the exact Paper Satellites review but misses `evidence:fixture-review-006` for “low end guides each change.” The query shares no lexical token with “The bass line carries every transition,” and the graph route points to `evidence:fixture-review-004`. Baseline required-evidence recall is therefore 0.5 on the frozen two-scenario suite.

Task 11 evaluates lexical+graph, exact vector, and RRF fusion over the same 12-record corpus. Every corpus row comes from a distinct record in `data/fixtures/reviews.json`; there are no duplicated padding rows. The deterministic fixture embedding identity includes the canonical-text SHA-256 plus provider, model, dimension, L2 normalization, retrieval-policy version, and embedding-policy version.

The release path requires `--postgres-dsn`. It creates the real PostgreSQL `vector` extension, stores immutable versioned rows, and issues exact cosine queries with `ORDER BY embedding <=> query::vector`. It rejects a reused version key whose text, identity, or vector differs and creates a new row whenever any declared identity field changes. HNSW and IVFFlat are absent because the 12-record fixture is below any justified ANN threshold.

Latency is measured in microseconds from 20 wall-clock samples per scenario. Baseline samples time lexical+graph retrieval alone. Each fused sample measures the complete parallel critical path: lexical+graph and exact-vector SQL run concurrently on separate PostgreSQL connections, both results are awaited, and RRF fusion completes before the timer stops. The report derives both p95 values from those observed samples before calculating their relative increase. Vectors enable only when fusion is non-regressive, required evidence ranks first, exact Recall@10 is at least 0.95, measured p95 growth is at most 20 percent, the corpus exceeds K, and persistent pgvector state is verified. Omitting the DSN or failing any gate preserves the remediation’s fail-closed disabled state.

Run the release ablation with:

```text
python -m pipeline.ablate_retrieval --suite data/evaluations/retrieval-golden.jsonl --output .omo/evidence/task-11-real-pgvector/golden.json --postgres-dsn postgresql://USER:PASSWORD@HOST:PORT/DATABASE
```
