# Vercel fixture-preview configuration

The Vercel project root directory is `frontend`. Do not deploy the repository root, backend, worker, GraphDB, or any real data integration. This configuration prepares protected preview deployments only; it does not authorize or perform a deployment.

| Variable | Local | Preview | Production | Exposure rule |
| --- | --- | --- | --- | --- |
| `NEXT_PUBLIC_DEMO_MODE` | `fixture` | `fixture` | `fixture` | Public, non-secret mode label only |
| `BACKEND_BASE_URL` | `https://fixture-api.example.invalid` | protected fixture service URL when approved | protected fixture service URL when approved | Server-only; this slice never contacts it |
| `BACKEND_SHARED_SECRET` | local placeholder | Vercel encrypted secret | Vercel encrypted secret | Server-only; never `NEXT_PUBLIC_` |

Preview protections: enable Vercel Deployment Protection before assigning a preview URL, and restrict project membership to reviewers who may access fixture output. Vercel Production must track `main`; it may expose only the public fixture mode until the later authentication and real-data gates have passed. Do not place credentials, Notion configuration, provider keys, GraphDB connection strings, or personal-review data in any Vercel variable.

## Local checks

```powershell
cd frontend
node node_modules\next\dist\bin\next build
$env:NEXT_PUBLIC_BACKEND_SHARED_SECRET = 'must-fail'
node node_modules\next\dist\bin\next build
Remove-Item Env:NEXT_PUBLIC_BACKEND_SHARED_SECRET
```

The second command must fail before compiling. The public browser surface makes requests only to `/api/fixture/*`; those routes use deterministic in-process fixtures and make no upstream request.
