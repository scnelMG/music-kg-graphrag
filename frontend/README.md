# Fixture review desk

This Next.js vertical slice is an evidence-review desk for a single public
fixture candidate. The browser calls only same-origin routes under
`/api/fixture/*`. Those server-side BFF routes authenticate to the separately
hosted Spring fixture API; neither browser code nor responses expose the shared
credential. The frontend does not contact GraphDB, providers, an LLM, or
Notion.

Run locally with `pnpm dev` after configuring `BACKEND_BASE_URL` and
`BACKEND_BFF_SHARED_SECRET`. The browser QA suite is `pnpm test:e2e`; see
[`deployment/vercel-fixture-preview.md`](../deployment/vercel-fixture-preview.md)
for protected-preview and variable requirements.
