# Allowlisted Evidence Queries

`templates/` contains the only supported SPARQL query shapes. Callers select a
template name and provide typed bindings; they cannot provide SPARQL text. Every
template is capped at three hops, `LIMIT 100`, and a 1,000 ms fail-closed timeout.

`fixtures/golden.jsonl` pairs every template with an immutable JSON oracle.
`fixtures/adversarial.jsonl` proves unsupported relations, unsafe input, unknown
entities, excessive traversal, row limits, timeout requests, and raw query text
are rejected before execution.

Run from `pipeline/`:

```text
python -m pipeline.snapshot_queries --suite ../queries/fixtures/golden.jsonl --output ../.omo/evidence/task-8-query-snapshot.json
```
