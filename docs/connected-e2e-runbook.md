# Connected Service Test Runbook

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
