# Backend Scaffold

Future Spring Boot service boundary for:

- album search orchestration,
- candidate selection and review persistence,
- Notion sync status and dry-run reporting,
- recommendation and GraphRAG API responses,
- health and operational endpoints.

Todo 1 intentionally does not add controllers, DTOs, migrations, services, or endpoint code. Later backend work should preserve the Todo 0 decisions: PostgreSQL is canonical, GraphDB is rebuilt from normalized data, and external tokens never appear in responses or logs.
