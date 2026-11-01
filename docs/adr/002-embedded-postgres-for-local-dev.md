# ADR 002: Embedded PostgreSQL for local development

- **Status:** Accepted
- **Date:** 2026-11-01

## Context

Local setup previously required a separately installed PostgreSQL server, manually created database, hand-applied migrations, and local database credentials. This increased setup effort and allowed missing or default credentials to remain hidden until a request failed.

The application relies on PostgreSQL behavior and SQL, so replacing it with a different database would create avoidable compatibility risk. Existing routes and tests also depend on a small shared database interface (`query`, `connect`, `disconnect`, and `transaction`).

## Decision

Use PGlite, an embedded PostgreSQL implementation, as the default local database. Use the existing `pg` driver when `DATABASE_URL` (or the legacy `DB_HOST` configuration) is set. Both drivers are wrapped by `server/config/db.js` and expose the existing database interface.

On first connection, the application creates a `schema_migrations` table, applies sorted SQL migration files exactly once, and seeds demo data in non-production embedded development by default. `SEED_DEMO=true` explicitly opts into seeding; `SEED_DEMO=false` disables it. The default embedded database is stored in `data/pgdata`; tests use an in-memory database unless `PGLITE_DIR` is explicitly configured.

The server connects and completes initialization before accepting requests. If `JWT_SECRET` is absent, development startup generates a temporary random secret and warns; production startup fails instead. No database username or password is supplied as a fallback.

## Consequences

- A local developer can install dependencies and start the application without installing PostgreSQL or manually applying migrations.
- The same PostgreSQL SQL and schema continue to run on a real PostgreSQL server through `pg`.
- `npm run db:migrate` applies tracked migrations to a configured PostgreSQL database. `npm run db:reset` removes only the default embedded data directory.
- PGlite is a pre-1.0, single-connection development/test option. A real PostgreSQL service remains the deployment option.
- A PostgreSQL database whose migrations were applied manually before the tracking table existed must be recreated or have its already-applied migration filenames recorded in `schema_migrations` before startup; migration 002 is not safe to re-run against an existing schema.
- A copied legacy `.env` containing `DB_HOST` selects the `pg` driver. Remove the `DB_*` settings to use embedded PGlite.
