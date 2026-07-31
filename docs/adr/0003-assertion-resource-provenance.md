# ADR 0003: Model provenance as explicit assertion resources

## Status

Accepted

## Context and decision

Every persisted music claim and recommendation-evidence path will be represented by an assertion resource with stable identifier, source/provider, retrieval timestamp or fixture version, confidence, and named-graph context. A source link on an entity alone is not enough because different assertions about one entity can have different origins.

## Consequences

Later relational, RDF, query, recommendation, and GraphRAG work must preserve assertion identifiers in evidence bundles. Unqualified claims cannot be offered as verified recommendation evidence.
