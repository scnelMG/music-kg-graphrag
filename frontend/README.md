# Personal music desk

The active page is a personal music desk. The browser calls only same-origin
routes under `/api/music/*`; server-side BFF routes call the Spring connected
API. The browser never receives the Notion API token or the BFF shared secret.

The connected API searches MusicBrainz, reads and writes the user's shared
Notion data source, and projects the minimum personal evidence into private
GraphDB before retrieving transparent recommendations. It does not make an LLM
call or use a vector store.

For local use, start both services with:

```powershell
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File ..\scripts\start-connected-service.ps1
```

The script supplies a process-only local BFF secret. For an independently
hosted frontend, configure `BACKEND_BASE_URL` and `BACKEND_BFF_SHARED_SECRET`
as server-only environment variables. See
[`docs/connected-service-setup.md`](../docs/connected-service-setup.md) for
Notion sharing and safe activation.
