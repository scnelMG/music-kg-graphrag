# Music Knowledge Graph & GraphRAG

Portfolio backend/data project scaffold for turning personal album records into a PostgreSQL-backed app, RDF knowledge graph, and evidence-grounded GraphRAG recommendation flow.

This repository is intentionally scaffold-only at Todo 1. It defines the workspace layout, local services, configuration contract, and frontend demo UI planning. It does not yet include database migrations, API endpoints, ontology TTL/SHACL content, metadata pipeline logic, Notion sync logic, GraphRAG logic, or product screens.

## Architecture Direction

- Backend API: Spring Boot, later under `backend/`
- Data and AI pipeline: Python worker/CLI, later under `pipeline/`
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

2. Fill the required values in `.env`. Use a real contactable MusicBrainz User-Agent before any live MusicBrainz calls.

3. Validate local configuration.

   ```bash
   bash scripts/check-env.example.sh .env
   ```

4. Validate Docker Compose without starting containers.

   ```bash
   docker compose config
   ```

5. Start local services only when a later todo needs them.

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
bash scripts/check-env.example.sh .env
docker compose config
docker compose up -d postgres graphdb
docker compose down
git diff --check
```

The verification evidence for Todo 1 is recorded in `.omo/evidence/task-1-music-kg-graphrag-plan.txt`.

## Repository Layout

```text
backend/        Spring Boot backend service scaffold
pipeline/       Python metadata, RDF, embedding, and GraphRAG pipeline scaffold
frontend/       Demo UI planning scaffold only
ontology/       Future RDF/OWL/SHACL assets
queries/        Future SPARQL query files
docs/           Research, architecture, and planning docs
data/fixtures/  Local fixture data for tests and demos
scripts/        Local developer scripts
.omo/evidence/  Verification evidence artifacts
```

## Guardrails

- Do not commit real `.env` files or secrets.
- Do not start live external API calls from default tests.
- Do not alter existing Notion schema or overwrite user-entered Notion values.
- Do not treat GraphDB as the system of record; rebuild it from normalized data.
- Do not build frontend product screens before backend/data paths and contracts exist.
