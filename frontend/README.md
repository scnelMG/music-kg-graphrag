# Fixture review desk

This Next.js vertical slice is an evidence-review desk for a single public fixture candidate. It contains only same-origin routes under `/api/fixture/*`; it does not contact GraphDB, providers, an LLM, Notion, or an external backend.

Run locally with `pnpm dev`. The browser QA suite is `pnpm test:e2e`; see [`deployment/vercel-fixture-preview.md`](../deployment/vercel-fixture-preview.md) for protected-preview and variable requirements.
