# Connected Music Release Design

**Goal:** Ship a reproducible personal music journal that searches live MusicBrainz data, writes the selected album and favourite track to Notion, and returns evidence-backed personal recommendations.

## Scope and release order

The work is delivered as three dependent releases.

1. **Release integrity:** track the connected source files in Git, make the connected backend and frontend mandatory CI inputs, and deploy the reviewed frontend to Vercel Production.
2. **Personal evidence graph:** synchronize the current Notion record set into a deterministic RDF projection and query it with GraphDB for recommendation evidence. The connected API remains Notion-first: Notion is the source of truth; the graph is derived and rebuildable.
3. **Operational proof:** expose redacted dependency metrics, exercise the complete browser flow against Production, and identify any pre-fix temporary Notion entry without touching a possible user-owned record automatically.

## Runtime design

The Vercel frontend calls only same-origin BFF routes. The BFF injects the shared secret and calls the Spring Cloud Run service. The Spring service uses MusicBrainz for live album and track selection and Notion for personal records.

The graph projector consumes only normalized records returned by the Notion gateway. It creates a named graph per deterministic projection generation and publishes the graph only after the complete projection succeeds. The graph contains album, artist, favourite-track, ownership, sentiment, and MusicBrainz release-group identifiers. A recommendation query returns candidates plus the explicit record and graph-path evidence used for scoring. GraphDB is never a browser-facing dependency and a GraphDB failure returns a typed, recoverable recommendation state rather than fabricated results.

## Interfaces and invariants

- Notion is the only authoritative personal-record store. The service must not claim a graph write is a user-record write.
- MusicBrainz search and track lookup return provider-backed values; no fabricated album, cover, artist, or track row is allowed.
- Every saved record has a release-group MBID, at least one artist credit, sentiment, and favourite track.
- Graph projection input is versioned by a content hash of normalized records. Repeating identical input is a no-op; a changed input creates a new derived generation.
- Recommendation responses identify their retrieval method and individual evidence sources. They must not claim LLM generation.
- Production runtime remains scale-to-zero, max scale one, 1 CPU, and 512 MiB unless a separately approved capacity change is made.

## Error handling and observability

Notion and MusicBrainz failures are converted to typed, redacted responses. The service records counters and latency summaries for catalog search, track lookup, record writes, graph projection, and recommendation queries. Health remains safe to expose through the BFF and does not reveal downstream credentials or raw provider payloads.

## Verification

- Unit tests cover canonical graph projection, changed-input generation, graph-backed recommendation evidence, and typed failures.
- Integration tests use GraphDB only where the test can observe a real SPARQL query/result contract.
- Production manual QA searches a real Korean album, selects a real track, creates and updates one temporary Notion record, trashes it, and checks the browser-rendered record/recommendation state.
- Vercel Production deployment is considered complete only after the current Git commit, frontend build, BFF boundary, and protected browser surface are all identified in the deployment evidence.

## Exclusions

This design does not add public multi-user accounts, external LLM text generation, or direct browser access to Notion, GraphDB, or provider credentials.
