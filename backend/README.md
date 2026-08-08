# Backend Foundation

Future Spring Boot service boundary for:

- album search orchestration,
- candidate selection and review persistence,
- Notion sync status and dry-run reporting,
- recommendation and GraphRAG API responses,
- health and operational endpoints.

PostgreSQL is canonical. The Flyway baseline holds normalized music/review history, provider identities and snapshots, job/idempotency records, deletion state, and a transactional projection outbox. GraphDB and embeddings remain derived work only; no request transaction writes either system.

Outbox rows move through `PENDING`, `PROCESSING`, `SUCCEEDED`, `RETRYABLE_FAILED`, and `TERMINAL_FAILED`. Attempts, a scheduled retry time, and only redacted error codes are retained. Terminal rows are inspectable and can be replayed without a second canonical mutation or second outbox row:

```sql
SELECT replay_terminal_outbox_event('<event UUID>', now());
```

Run the foundation test from the repository root:

```bash
bash backend/gradlew -p backend test --no-daemon
```

On Windows PowerShell, use `backend\\gradlew.bat -p backend test --no-daemon`.

## Fixture BFF boundary

Every HTTP route requires exactly one `X-Music-Kg-Bff-Secret` header matching
`BACKEND_BFF_SHARED_SECRET`. Keep that value server-only in Vercel and Google
Secret Manager. `GET /api/v1/health` is the authenticated health endpoint;
missing or invalid credentials return the typed `BFF_AUTH_REQUIRED` response.

Container and Cloud Run instructions live in
[`deployment/cloud-run/README.md`](../deployment/cloud-run/README.md).
