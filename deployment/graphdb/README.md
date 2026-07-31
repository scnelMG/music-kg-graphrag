# GraphDB 10.8.8 repository lifecycle

The release artifact uses GraphDB 10.8.8 by immutable multi-platform image
digest:

```text
ontotext/graphdb@sha256:e66ad4c6cbec16bb209735d4f777c97bab8c508cdd7709d916abe854612052d3
```

The digest was resolved on 2026-07-31 with:

```text
docker buildx imagetools inspect ontotext/graphdb:10.8.8
```

The observed platform manifests were
`sha256:e907ccbe7489eb344b2b7244501d7f05cf166e8aa4e714ca4fbc831db7e1402d`
for `linux/amd64` and
`sha256:24156db8001332b61fc235ac15d1e8fac1c627519362ece37b1a064b39df86fb`
for `linux/arm64/v8`. The tag is recorded only as digest provenance; Compose
does not use the mutable tag.

## Compatibility and license decision

GraphDB 10.8.8 was selected to match the existing 10.8 deployment decision
while using the 10.8 RDF4J repository-template and SHACL configuration
contract. The repository starts with an RDF4J `ShaclSail` wrapper and
`validationEnabled true`; this setting is creation-time only. Reusing an old
repository that was created without SHACL is prohibited. Delete the derived
volume and rebuild it instead.

GraphDB Free is the chosen fixture and low-load portfolio mode. Ontotext
documents that Free starts without a license file, but it is not open source.
The low-load restriction here is a project deployment boundary, not a claimed
vendor capacity limit. Enterprise use requires a separate commercial-license
decision. If Enterprise is selected, install its license noninteractively with
the documented `graphdb.license.file` configuration or a readable
`graphdb.license` file under GraphDB home; do not upload it through Workbench
and never commit it.

References:

- [GraphDB 10.8 repository configuration](https://graphdb.ontotext.com/documentation/10.8/configuring-a-repository.html)
- [GraphDB 10.8 SHACL validation](https://graphdb.ontotext.com/documentation/10.8/shacl-validation.html)
- [GraphDB 10.8 REST repository management](https://graphdb.ontotext.com/documentation/10.8/manage-repos-with-restapi.html)
- [GraphDB 10.8 license setup](https://graphdb.ontotext.com/documentation/10.8/set-up-your-license.html)
- [Ontotext GraphDB Docker image](https://hub.docker.com/r/ontotext/graphdb)

## Noninteractive creation

`graphdb-bootstrap` waits for GraphDB health, checks whether `music-kg`
already exists, and POSTs `repository-config.ttl` only when absent. On both
the create and reuse paths it reads GraphDB's JSON repository configuration
back and requires the exact repository ID plus `isShacl`, `validationEnabled`,
and the reserved shapes-graph parameter. It refuses an unsafe
retained repository instead of mutating that creation-time setting. The job
then loads `music-shapes.ttl` into the reserved RDF4J SHACL graph and verifies
the complete canonical project-shape checksum and parsed readback triple count
through the RDF4J statements endpoint. A normal SPARQL `GRAPH` count is not
used for this reserved graph because GraphDB does not expose those shapes as a
regular query graph. Compose runs the same typed verifier used by the
projector, so bootstrap does not parse the JSON response as Turtle or rely on
substring matching. There are no Workbench clicks.

```text
docker compose up -d graphdb graphdb-bootstrap
docker compose ps
docker compose logs graphdb-bootstrap
```

GraphDB exposes port 7200 only to the internal Compose network. Operator
access must use an authenticated private-network tunnel or `docker compose
exec`; never add a host `ports` mapping.

The container readiness probe requires HTTP success from
`/rest/repositories`; the Workbench root returns HTTP 406 to `wget --spider`
and is not a valid readiness target.

## Private-network projection verification

The `graphdb-projector` profile builds the pipeline with a digest-pinned
runtime, creates or verifies the SHACL repository without prompts, loads the
validated fixture graph, then verifies it through GraphDB statements readback
and a SPARQL triple count. The fixture `pipeline.project_graph` CLI accepts a
manifest; its `--graphdb-url` mode is the live GraphDB path, while omitting the
URL intentionally selects an in-memory fixture repository.

The canonical `pipeline.project_outbox` CLI is a separate PostgreSQL-to-
GraphDB path. It requires `--database-url`, `--graphdb-url`, and `--output`,
claims due rows from PostgreSQL's canonical outbox, and writes terminal or
retry state back to PostgreSQL. `--replay-event` first uses the PostgreSQL
terminal replay function, reconciles the matching durable GraphDB terminal
receipt, then invokes the GraphDB adapter. PostgreSQL generation IDs are the
same UUIDs used in the GraphDB generation named-graph IRIs.

Both paths store private projection-event receipts in GraphDB control named
graphs. An atomic `INSERT ... WHERE NOT EXISTS` receipt claim binds the event
ID plus target graph and payload hash before loading, so concurrent or later
changed reuse is terminal and cannot overwrite the target graph, while
same-identity replay can recover an interrupted load.

Before hashing and loading, the adapter canonicalizes RDF 1.1 string literals
so explicit `xsd:string` input compares equal to GraphDB's plain-literal REST
readback. Post-load verification therefore compares graph semantics instead
of serializer-specific lexical forms.

Terminal outcomes are stored separately in private terminal-receipt graphs
with their error codes. REST `--replay-event` first reads that durable state;
an event without a terminal receipt is refused. A successful corrected replay
deletes the terminal receipt, while a repeated conflict remains terminal and
deterministically replayable.

`--reset` deletes and recreates only the `music-kg` repository inside the
currently mounted GraphDB home, then repeats that repository-level rebuild.
It proves repository rebuild determinism; it does **not** remove the Docker
volume or prove two independently fresh-volume rebuilds. A clean-volume
snapshot counts only when the run uses a distinct newly-created QA volume or
records an explicit volume reset. For a clean-volume exercise, run
`docker compose down --volumes` between two separately captured projection
runs, and retain the volume names and count/checksum artifacts for both runs.

The real GraphDB runtime path is verified in the captured remediation QA:
bootstrap and shape readback succeeded, an invalid RDF write returned a real
SHACL validation report and rolled back, and the no-reset projector produced
43 triples with matching count/checksum. Combined post-fix canonical
PostgreSQL-outbox QA also verifies a valid load, exact duplicate delivery,
invalid-before-load terminal receipt, and corrected replay against isolated
PostgreSQL and GraphDB QA volumes. The preserved project volume was not
modified by that exercise.

```text
docker compose --profile graphdb-integration up --build --abort-on-container-exit --exit-code-from graphdb-projector graphdb-projector
docker compose --profile graphdb-integration down
```

The first command includes the projector's repository-scoped `--reset`. To
verify projection without deleting and recreating the repository, run the
same image with an explicit no-reset command:

```text
docker compose --profile graphdb-integration run --rm graphdb-projector --fixture /app/data/fixtures/manifest.json --graphdb-url http://graphdb:7200 --output /evidence/live-graphdb-report-no-reset.json
```

The report is written to
`deployment/evidence/task-7/live-graphdb-report.json`. GraphDB and the
projector share only `graph-private`; neither service publishes port 7200.
If GraphDB cannot be reached, the command exits nonzero and records
`GRAPHDB_UNAVAILABLE`. A SHACL commit rejection is recorded as
`GRAPHDB_LOAD_REJECTED` and remains selectable with `--replay-event`. GraphDB
10.8 returns that rejection as HTTP 500 with
`application/shacl-validation-report+n-quads`; the client verifies the RDF
`sh:ValidationReport` has `sh:conforms false` before classifying it as terminal.
Other HTTP 5xx responses remain retryable.
