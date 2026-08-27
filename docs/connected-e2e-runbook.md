# Connected Service Test Runbook

## Release-quality gate split

Run the deterministic unit and contract gate without Docker:

```powershell
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File scripts\run-service-quality.ps1
```

Run Docker-backed PostgreSQL, outbox, and persistent pgvector integration tests explicitly:

```powershell
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File scripts\run-service-quality.ps1 -Integration
```

The integration command is not allowed to degrade into a skip or a unit-test pass when Docker is unavailable. Start Docker Desktop first, then rerun the same command. Persistent vector retrieval and production LLM wording remain disabled until their authenticated evidence reports pass.

## Authenticated release evidence

Run the persistent pgvector gate against a non-production PostgreSQL database. The command exits non-zero and leaves vector retrieval disabled unless the real store passes ranking, persistence, concurrency, and latency checks:

```powershell
if ([string]::IsNullOrWhiteSpace($env:PERSISTENT_PGVECTOR_DSN)) { throw "PERSISTENT_PGVECTOR_DSN is required." }
New-Item -ItemType Directory -Force -Path .omo\evidence\persistent-pgvector | Out-Null
pipeline\.venv\Scripts\python.exe -m pipeline.ablate_retrieval `
  --suite data\evaluations\retrieval-golden.jsonl `
  --output .omo\evidence\persistent-pgvector\report.json `
  --postgres-dsn $env:PERSISTENT_PGVECTOR_DSN
if ($LASTEXITCODE -ne 0) { throw "Persistent pgvector evidence gate failed." }
```

Run the optional external-LLM explanation gate only against an authenticated non-production connected backend. It stores status, latency, model ID, and citation count, but never persists the generated answer or private record identifiers:

```powershell
if ([string]::IsNullOrWhiteSpace($env:CONNECTED_BACKEND_URL)) { throw "CONNECTED_BACKEND_URL is required." }
if ([string]::IsNullOrWhiteSpace($env:BACKEND_BFF_SHARED_SECRET)) { throw "BACKEND_BFF_SHARED_SECRET is required." }
if ([string]::IsNullOrWhiteSpace($env:MUSIC_KG_LLM_MODEL)) { throw "MUSIC_KG_LLM_MODEL is required." }
$headers = @{ "X-Music-Kg-Bff-Secret" = $env:BACKEND_BFF_SHARED_SECRET }
$response = $null
$elapsed = Measure-Command {
  $response = Invoke-RestMethod -Method Post -Headers $headers `
    -Uri "$($env:CONNECTED_BACKEND_URL.TrimEnd('/'))/api/v1/personal-insights/explanation"
}
if ($response.status -ne "GENERATED" -or @($response.citations).Count -eq 0) { throw "External LLM evidence gate did not produce a grounded explanation." }
New-Item -ItemType Directory -Force -Path .omo\evidence\external-llm | Out-Null
[ordered]@{
  measuredAt = [DateTimeOffset]::UtcNow.ToString("O")
  model = $env:MUSIC_KG_LLM_MODEL
  status = $response.status
  citationCount = @($response.citations).Count
  latencyMilliseconds = [Math]::Round($elapsed.TotalMilliseconds, 3)
} | ConvertTo-Json | Set-Content -Encoding UTF8 .omo\evidence\external-llm\report.json
```

Do not run either command with production personal data. Keep both related feature flags disabled until the resulting report is reviewed and attested through the release-evidence workflow.

## Production browser audit

For a dependency-independent public audit, start the read-only audit backend and the optimized frontend in separate terminals:

```powershell
pnpm --dir frontend start:audit-backend
```

```powershell
$env:BACKEND_BASE_URL = "http://127.0.0.1:18082"
$env:BACKEND_BFF_SHARED_SECRET = "audit-local-secret"
pnpm --dir frontend start --port 3000
```

Then run the public production-browser audit:

```powershell
$env:AUDIT_BASE_URL = "http://127.0.0.1:3000"
pnpm --dir frontend audit:production
```

This command uses installed Chrome through Playwright, audits `/`, `/method`, `/privacy`, and `/terms` at 375px, 768px, and 1280px, writes full-page screenshots with the reports, fails below 100 in any Lighthouse category, and fails on browser warnings or errors. It also rejects performance evidence when Lighthouse reports a local CPU benchmark below 2000; rerun on an idle machine instead of accepting a throttled score. The audit backend exposes only an empty, schema-valid public recommendation response; it does not replace connected-service integration tests.

## Read-only local readiness

When `.env` has a connected Notion data source, start the private local GraphDB
once and then run the readiness probe below. The probe starts a temporary local
Spring process, calls only authenticated `GET /health` and `GET /ready`, and
always stops that process. It does not create, update, archive, or restore a
Notion page.

```powershell
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File scripts\start-personal-graphdb.ps1
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File scripts\run-local-connected-readiness.ps1 -CatalogQuery "아이유"
```

For local convenience, the scripts accept an existing `GRAPHDB_BASE_URL` as a
fallback for the explicit connected base URL. They deliberately do **not** reuse
the general `GRAPHDB_REPOSITORY`, which belongs to the canonical pipeline; the
personal service defaults to its separate `music-kg-personal` repository.
Deployment templates still require explicit connected-service values.

The readiness output gives only dependency status and the count of real catalog
albums/tracks, not the album title, Notion page, token, or provider response.

## Safety boundary

The browser and Cloud Run service must point at the same dedicated Notion data source for mutation testing. Do not use the personal production data source as an E2E target.

1. Create a separate Notion database with the same required properties.
2. Share only that database with the integration.
3. Deploy a separate Cloud Run service configured with its data-source ID and a distinct BFF secret.
4. Copy `.env.e2e.example` to `.env.e2e`; set `NOTION_DATA_SOURCE_ID` to the dedicated ID and `NOTION_PRODUCTION_DATA_SOURCE_ID` to the real production ID.
5. Keep `.env.e2e` untracked.

The E2E command refuses if the two data-source IDs match. Its default mode is plan-only and makes no HTTP request or Notion change.

## Read-only readiness proof

```powershell
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File scripts\run-connected-smoke.ps1 `
  -Mode connected -EnvironmentPath .env.e2e `
  -BaseUrl https://your-connected-e2e-service.run.app
```

It sends the BFF secret only as a request header, verifies `/api/v1/health` and `/api/v1/ready`, and prints only service mode plus dependency readiness codes.

## Real-data, dedicated-source E2E

First inspect the plan:

```powershell
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File scripts\run-connected-notion-e2e.ps1 `
  -BaseUrl https://your-connected-e2e-service.run.app `
  -EnvironmentPath .env.e2e -AlbumQuery "아이유"
```

Then execute it against the dedicated service:

```powershell
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File scripts\run-connected-notion-e2e.ps1 `
  -BaseUrl https://your-connected-e2e-service.run.app `
  -EnvironmentPath .env.e2e -AlbumQuery "아이유" -Execute
```

The script fetches real MusicBrainz search results, selects an album absent from that dedicated Notion history, fetches the real track list, creates the record, reads it back, archives it, restores it, and archives it again. If the run fails after creation it attempts to archive only the page it created. Notion's API archives pages rather than permanently deleting them, so the final artifact remains in the dedicated database's trash for auditability.

## Production verification after an immutable deployment

Use the same read-only smoke command with the production service URL and an environment file containing production credentials. Do not pass `-AllowProductionNotionWrite`; the smoke command does not write and production mutation proof is intentionally out of scope.

To examine request volume and latency after real traffic, call authenticated `GET /api/v1/operations`. It returns aggregate operation counters only and resets on a new Cloud Run instance or revision. Use Cloud Run request/error metrics for durable platform-level alerting.
