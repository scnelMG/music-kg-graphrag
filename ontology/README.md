# Music KG Ontology (unverified draft)

The existing RDF/OWL and SHACL files are an unverified draft surface for personal album listening records, source-aware music metadata, recommendation evidence, and later GraphRAG retrieval. Task 6 owns semantic validation and must not be inferred complete merely because these files exist. This directory does not yet prove RDF generation, GraphDB loading, SPARQL query execution, or application APIs.

## Files

- `ontology/prefixes.ttl` - shared namespace declarations for ontology, resources, named graphs, and common vocabularies.
- `ontology/music-ontology.ttl` - OWL classes and properties for the MVP graph model.
- `shapes/music-shapes.ttl` - SHACL validation rules for required album, track, review, rating, and recommendation fields.
- `data/fixtures/task-5-invalid-sample.ttl` - intentionally incomplete RDF used to prove validation failures are detected.

## Scope

The core classes are `User`, `Artist`, `Album`, `Track`, `Genre`, `Mood`, `ListeningContext`, `UserReview`, `Recommendation`, and `Source`.

The core relationships are `createdBy`, `containsTrack`, `hasGenre`, `hasMood`, `wroteReview`, `targetAlbum`, `favoriteTrack`, `similarTo`, and `hasReason`.

`Source`, `source`, and `externalId` are included from the start because the research notes require MusicBrainz/Wikidata/Last.fm and manual data to remain source-qualified. Festival, performance, instrument, symbolic score, and MusicXML features are deferred extension modules; the MVP ontology should not require them.

## URI Strategy

Use stable HTTPS identifiers even in local development:

```text
Ontology terms: https://w3id.org/music-kg-graphrag/ontology#Album
Resources:      https://w3id.org/music-kg-graphrag/resource/album/{slug-or-id}
Named graphs:   https://w3id.org/music-kg-graphrag/graph/{dataset-or-run}
```

Resource paths should be lowercase, URL-safe, and typed by path segment: `user/`, `artist/`, `album/`, `track/`, `genre/`, `mood/`, `context/`, `review/`, `recommendation/`, and `source/`.

Prefer canonical external identifiers when available:

- MusicBrainz MBIDs for canonical artist, release group, release, and recording identity.
- Wikidata QIDs for optional public-knowledge enrichment.
- Last.fm tag keys only as soft enrichment evidence.
- Manual identifiers for private/user-entered records that lack catalog matches.

Do not replace local resource URIs with third-party URLs. Store third-party identifiers with `music:externalId` and connect the entity to a `music:Source` with `music:source` when the assertion depends on that source. This keeps internal links stable if an external catalog is unavailable or a match is corrected.

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

The intended future contract is that RDF passes `shapes/music-shapes.ttl` before GraphDB load. Task 6 must demonstrate that contract:

- Albums require `music:title`, at least one `music:createdBy` artist, and at least one `music:containsTrack` track.
- Tracks require `music:title` and at least one `music:createdBy` artist.
- User reviews require `music:targetAlbum` and a controlled `music:ratingLabel`.
- Recommendations require `music:targetAlbum` and `music:hasReason`.

The invalid fixture intentionally omits several of these values so validation evidence can prove the shapes are active.
