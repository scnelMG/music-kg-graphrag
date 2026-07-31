# Music Knowledge Graph & GraphRAG

Fixture-only foundation for a portfolio backend/data project that will turn anonymised album records into a PostgreSQL-backed app, RDF knowledge graph, and evidence-grounded GraphRAG recommendation flow.

Todo 1 establishes reproducible Java/Python build boundaries, a fixture-only worker CLI, local configuration checks, SBOM generation, digest-lock validation, and CI commands. It does not yet implement migrations, API endpoints, RDF/SHACL validity proof, metadata ingestion, Notion sync, GraphRAG, or product screens. Existing ontology and shape files are unverified inputs; Task 6 owns their validation proof.

## Architecture Direction

- Backend API: Spring Boot under `backend/` (currently a fixture-only application context)
- Data and AI pipeline: Python worker CLI under `pipeline/` (currently help/command boundary only)
- App database and vector storage: PostgreSQL with pgvector
- Knowledge graph: Ontotext GraphDB for RDF/SPARQL/SHACL workflows
- External sources: Notion, MusicBrainz, Cover Art Archive, optional Last.fm/Wikidata/LLM providers
- Frontend demo UI: operational portfolio interface for technical reviewers, planned in `DESIGN.md` and `docs/frontend-demo-ui-plan.md`

The Todo 0 research package under `docs/research/` and `outputs/tech-stack-rationale.md` is the source of truth for these choices.

## Quick Start

1. Copy the example environment file.

   ```bash
   cp .env.example .env
   ```

2. Fill the required local values in `.env`. The public service remains fixture-only; do not add real credentials or enable external calls.

3. Validate local configuration.

   ```bash
   bash scripts/check-env.sh .env
   ```

4. Validate Docker Compose without starting containers.

   ```bash
   docker compose config
   ```

5. Start local services only when a later todo needs them. Compose images are development tags; release deployment must use `deployment/image-digests.lock`.

   ```bash
   docker compose up -d postgres graphdb
   ```

6. Stop local services.

   ```bash
   docker compose down
   ```

## Task Commands

Use these commands from the repository root:

```bash
bash backend/gradlew -p backend test --no-daemon
uv run --directory pipeline --group dev pytest tests
uv run --directory pipeline --group dev python -m pipeline --help
bash scripts/check-env.sh .env
docker compose config
bash scripts/verify-supply-chain.sh
git diff --check
```

The verification evidence for Todo 1 is recorded in `.omo/evidence/task-1-music-kg-evidence-graphrag.md`.

## Repository Layout

```text
backend/        Spring Boot fixture-service foundation
pipeline/       Python fixture-only worker CLI foundation
frontend/       Demo UI planning scaffold only
ontology/       Future RDF/OWL/SHACL assets
queries/        Future SPARQL query files
docs/           Research, architecture, and planning docs
data/fixtures/  Local fixture data for tests and demos
scripts/        Local developer scripts
.omo/evidence/  Verification evidence artifacts
```

## Guardrails

- Do not commit real `.env` files, credentials, or provider responses.
- Do not expose anything except anonymised fixtures in public surfaces.
- Do not use mutable image tags in release artifacts; validate digest locks before release.
- Do not start live external API calls from default tests.
- Do not alter existing Notion schema or overwrite user-entered Notion values.
- Do not treat GraphDB as the system of record; rebuild it from normalized data.
- Do not build frontend product screens before backend/data paths and contracts exist.
