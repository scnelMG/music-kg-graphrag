# Music KG Ontology

The RDF/OWL and SHACL files define the locally verified semantic contract for fixture music records, source-qualified assertions, and recommendation evidence. The validation CLI proves parsing and SHACL conformance without network calls. It does not prove GraphDB loading, SPARQL query execution, RDF projection from application data, or application integration.

## Files

- `ontology/prefixes.ttl` - shared namespace declarations for ontology, resources, named graphs, and common vocabularies.
- `ontology/music-ontology.ttl` - OWL classes and properties for the MVP graph model.
- `shapes/music-shapes.ttl` - SHACL validation rules for required album, track, review, rating, and recommendation fields.
- `data/fixtures/valid/music-graph.ttl` - complete fixture covering release identity, review context, assertion provenance, and recommendation evidence.
- `data/fixtures/invalid/*.ttl` - isolated failure fixtures with expected codes in `expected-codes.json`.

## Scope

The core classes are `User`, `Artist`, `ReleaseGroup`, `Release`, `Track`, `Genre`, `Mood`, `ListeningContext`, `UserReview`, `Recommendation`, `RecommendationEvidence`, `Assertion`, `Source`, `RetrievalRun`, and `NamedGraph`. `Album` remains only as a deprecated compatibility superclass for `ReleaseGroup` and `Release`.

The core relationships include `createdBy`, `containsRelease`, `releaseOf`, `containsTrack`, `hasGenre`, `hasMood`, `hasListeningContext`, `wroteReview`, `targetReleaseGroup`, `favoriteTrack`, and `similarTo`.

Every source-qualified claim is a conventional `Assertion` resource, not RDF-star. SHACL requires its `stableId`, `source`, `assertedSubject`, `assertedPredicate`, `assertedObject`, bounded `confidence`, `retrievalRun`, and `namedGraph`. `source`, `retrievalRun`, and `namedGraph` are aligned through PROV-O subproperties or PROV-O classes. Festival, performance, instrument, symbolic score, and MusicXML features remain deferred extension modules.

## URI Strategy

Use stable HTTPS identifiers even in local development:

```text
Ontology terms: https://w3id.org/music-kg-graphrag/ontology#Album
Resources:      https://w3id.org/music-kg-graphrag/resource/album/{slug-or-id}
Named graphs:   https://w3id.org/music-kg-graphrag/graph/{dataset-or-run}
```

Resource paths should be lowercase, URL-safe, and typed by path segment: `user/`, `artist/`, `release-group/`, `release/`, `track/`, `genre/`, `mood/`, `context/`, `review/`, `recommendation/`, `evidence/`, `assertion/`, `run/`, and `source/`.

Prefer canonical external identifiers when available:

- MusicBrainz MBIDs for canonical artist, release group, release, and recording identity.
- Wikidata QIDs for optional public-knowledge enrichment.
- Last.fm tag keys only as soft enrichment evidence.
- Manual identifiers for private/user-entered records that lack catalog matches.

Do not replace local resource URIs with third-party URLs. Store provider identity with `music:externalId`; represent each provider-dependent claim as an assertion linked to its source. This keeps internal links stable if a catalog is unavailable or a match is corrected.

## Named Graph Conventions

Named graphs should separate assertion origin and lifecycle:

```text
https://w3id.org/music-kg-graphrag/graph/manual-reviews
https://w3id.org/music-kg-graphrag/graph/musicbrainz
https://w3id.org/music-kg-graphrag/graph/wikidata
https://w3id.org/music-kg-graphrag/graph/lastfm
https://w3id.org/music-kg-graphrag/graph/recommendation-runs/{run-id}
```

GraphDB repositories may load these named graphs later, but this document only records the naming convention; no validation or loading claim is made here.

## Validation Contract

Run the offline contract from the repository root:

```text
python -m pipeline.validate_rdf --fixture data/fixtures/valid --report valid-report.ttl
python -m pipeline.validate_rdf --fixture data/fixtures/invalid --expect-codes data/fixtures/invalid/expected-codes.json --report invalid-report.json
```

The validator parses the ontology, shapes, and fixtures with rdflib; asks pySHACL to meta-validate the shape graph; validates each fixture independently; and reports stable error codes. Exit status `0` means a valid fixture conformed or all expected invalid codes matched, `1` means semantic non-conformance or an expectation mismatch, and `2` means unsafe or malformed CLI input. The command performs no provider or network call.
