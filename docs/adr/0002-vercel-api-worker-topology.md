# ADR 0002: Keep Vercel, API, and workers separate

## Status

Accepted

## Context and decision

Vercel hosts only the Next.js web surface and short server-side BFF routes. The Spring fixture API runs outside Vercel, and the Python worker plus PostgreSQL and GraphDB run in separately managed infrastructure. A BFF-to-API shared secret is server-only and never uses a `NEXT_PUBLIC_` variable.

## Consequences

Long-running jobs, databases, and GraphDB are not deployed as Vercel functions. Backend outages must become typed UI states rather than silently falling back to fabricated data.
