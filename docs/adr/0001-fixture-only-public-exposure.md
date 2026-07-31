# ADR 0001: Keep all public exposure fixture-only

## Status

Accepted

## Context and decision

The project is a portfolio demonstration and must not expose personal music records or a live Notion integration. Public API/UI paths may read only source-controlled, anonymised fixture data. Real credentials, user reviews, provider responses, and Notion writes are prohibited from the public service and CI.

## Consequences

The demo can be reviewed without credentials or personal-data access. Claims about live-data privacy controls and Notion synchronisation remain deferred until explicitly designed, approved, and tested.
