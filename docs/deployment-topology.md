# Deployment topology, connected personal service, and GraphDB recovery

## Current production boundaries

The product has two deliberately separate data planes. They must not be
described as one runtime until an operator deploys a durable projection host.

- **Connected personal service:** Notion is the source of truth for a single
  listener's album records. The Spring API runs on Cloud Run in `connected`
  mode and reads/writes only the shared Notion data source. MusicBrainz is a
  live catalog dependency for album and track selection. Vercel exposes this
  API only through its server-side BFF shared-secret boundary; browser access
  is additionally protected by a signed, expiring access-session cookie.
- **Personal evidence graph:** each insight request builds a bounded,
  deterministic graph from the current Notion records and follows recorded
  artist edges into live MusicBrainz release groups. Every recommendation
  contains the contributing Notion page IDs and a score. It is an evidence
  graph traversal, not an LLM answer and not a persistent GraphDB/pgvector
  retrieval service.
- **Canonical projection pipeline:** PostgreSQL, outbox, GraphDB, SHACL and
  the Python projector remain a separate canonical-data/projection system.
  PostgreSQL is authoritative only for this projection plane. It is not the
  source of truth for the connected personal Notion service, and fixture
  pipeline output must never be shown as a listener record or recommendation.

The connected Cloud Run templates are versioned in
`deployment/cloud-run/connected-*-service.yaml.tmpl`. They require an
immutable image digest, user-managed runtime identity, server-only Notion/BFF
secrets, one request at a time (MusicBrainz's 1 RPS policy), max scale one,
CPU throttling and scale-to-zero. A Cloud Run deployment is a real external
change and is performed only after the checked-in manifest validation and
frontend/backend CI gates pass.

The machine-readable boundary is
[`deployment/topology-contract.json`](../deployment/topology-contract.json).
For the canonical projection plane, PostgreSQL is authoritative. GraphDB is a
disposable, versioned RDF projection reconstructed from a PostgreSQL snapshot
and projection generation; neither Workbench edits nor GraphDB backups can
become canonical.

## External host responsibilities

Vercel hosts the Next.js personal music journal and short same-origin BFF
routes. The deployment templates define separate preview and production Cloud
Run services for the connected Spring API, each with a distinct user-managed
runtime service account and only its own environment's BFF secret. The legacy
fixture controller remains test-only under `music-kg.connected.mode=fixture`;
the connected production manifest sets `music-kg.connected.mode=connected`.
PostgreSQL and GraphDB run on an
external stateful host, and the Python worker runs on an external worker host.
The backend and worker may join the private data network. Browser and Vercel
traffic cannot.

Only the frontend and authenticated backend have public routes. PostgreSQL,
the worker, GraphDB port 7200, SPARQL, Workbench, repository management, and
raw downstream errors stay private. The backend returns a redacted dependency
state instead of proxying GraphDB responses.

## Health and readiness

- Frontend: `/` proves the static/BFF surface is available.
- Backend: authenticated `/api/v1/health` reports only `status` and `mode`;
  missing or invalid BFF credentials return typed HTTP 401.
- PostgreSQL: `pg_isready` runs inside its trusted network.
- Worker: its private `/health/worker` reports outbox lag and terminal-failure
  count without payloads.
- GraphDB: the private container requires HTTP success from
  `/rest/repositories`. Readiness additionally requires the bootstrap job to
  exit zero, the JSON repository configuration to report `isShacl` and
  `validationEnabled` as true for the expected shapes graph, and an exact
  canonical checksum/parsed-count match from the shapes statements readback.

Backend traffic is enabled only after PostgreSQL migrations, GraphDB
repository creation, SHACL-shape load, outbox replay, and checksum validation
are complete.

## Projection failure and replay

Each outbox event has a stable ID. The worker validates its Turtle with the
Task 6 pySHACL contract before any repository write and replaces the complete
source/generation named graph. A repeated event ID with the same content is a
no-op; reuse with different content is terminal. Retryable GraphDB failures
use bounded exponential delays and remain in the canonical outbox. Parse or
SHACL failures become visible terminal records before load.

There are two explicit projector entry points. The canonical
`pipeline.project_outbox` CLI connects to PostgreSQL and GraphDB, claims due
rows from the PostgreSQL outbox, and records completion or retry state back in
PostgreSQL. Its `--replay-event` path selects a terminal event through the
PostgreSQL replay function before invoking GraphDB. The fixture
`pipeline.project_graph` CLI consumes a manifest; when given `--graphdb-url` it
uses the same GraphDB adapter, and without that option it is an in-memory
fixture run. The fixture CLI is not a substitute for canonical outbox
consumption.

Both GraphDB paths persist a private receipt named graph before the data write
using an atomic `INSERT ... WHERE NOT EXISTS` claim. The receipt binds event
ID, target generation graph, and payload hash and is protected from changed
concurrent delivery. A separate terminal-receipt graph persists the event ID
and error code. These private control graphs are adapter receipts, not a
replacement for the PostgreSQL outbox.

The pinned GraphDB runtime path is verified: bootstrap created the SHACL
repository and read back the canonical shapes, a real invalid write was
rejected and rolled back, and a no-reset fixture projection produced 43
triples with matching count/checksum. The combined post-fix
PostgreSQL-outbox-to-GraphDB QA also passed valid success, exact duplicate
delivery, invalid-before-load terminal persistence, and corrected replay. The
adapter normalizes RDF 1.1 string literals before hashing and comparison so
GraphDB's plain-literal REST readback is semantically equal to explicit
`xsd:string` input.

For the fixture CLI, `--reset` deletes and recreates the GraphDB repository
only. It does not remove the mounted Docker volume and must not be described
as a clean-volume reset. A clean-volume run counts only when it uses a
distinct, newly-created QA volume or records an explicit volume reset; a
reused named volume is not fresh-volume evidence. The deterministic operator
drill is `scripts/restore-fixture-volumes.ps1`. It creates GUID-prefixed
source and restored PostgreSQL volumes, a dump volume, a fresh GraphDB volume,
and an isolated network and containers. It seeds the canonical fixture and
outbox, performs `pg_dump`/`pg_restore`, projects the restored canonical
outbox, and requires matching database hashes/counts plus a verified graph
hash/count. Its JSON success artifact identifies
`postgres_fresh_volume_restore`, `restore_exit_code: 0`, and
`graph_verified: true`. The script's `finally` block removes only its exact
GUID-prefixed resources; it does not run Compose teardown or touch retained
project volumes.

Operators inspect redacted terminal codes in PostgreSQL, correct the canonical
input or deployment failure, and replay that event ID. They do not patch
GraphDB. Fixture replay uses:

```text
python -m pipeline.project_graph --fixture data/fixtures/manifest.json --reset --output projection.json
python -m pipeline.project_graph --fixture corrected-manifest.json --replay-event EVENT_ID --output replay.json
```

## Backup ownership and restore order

Platform Operations owns scheduled PostgreSQL backups, restore drills,
GraphDB volume snapshots, retention, encryption, and access control.
PostgreSQL backup success is the recovery gate. A GraphDB volume snapshot is
only an acceleration artifact and must identify the matching PostgreSQL
snapshot and projection generation.

Restore in this order:

1. Restore PostgreSQL and verify migrations, canonical row hashes, outbox, and
   projection generation.
2. Start GraphDB with a fresh volume and let the noninteractive bootstrap
   create the SHACL-enabled repository.
3. Load the pinned SHACL shapes into the RDF4J SHACL shape graph.
4. Replay pending/stale projection events from PostgreSQL.
5. Compare named-graph triple counts and checksums with the expected snapshot.
6. Start the backend and worker health gates, then enable backend traffic.

Run the isolated fixture proof from the repository root without exposing
credentials or host ports:

```powershell
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File scripts/restore-fixture-volumes.ps1 -OutputPath .omo/evidence/fresh-volume-restore/manual-report.json
```

If a GraphDB volume snapshot is restored, the same post-restore outbox replay
and checksum checks are mandatory. A mismatch discards the derived volume and
triggers the fresh-volume sequence above.
