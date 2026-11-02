# Threat Model

## Scope and trust boundaries

The application is a browser-based sports-management app with:

- A browser client that sends JSON requests over HTTPS.
- An Express.js API server that resolves authentication and team access rules.
- A PostgreSQL-compatible database (embedded PGlite in local dev; `pg` in production-style environments).

The main trust boundaries are:

- Browser to Express API.
- Express API to PostgreSQL.
- User session cookie and JWT to protected routes.
- Team ownership and role checks for resource access.

## Data flow sketch

```text
Browser (login/signup, team pages, roster, schedule)
        |
        v
Express API (routes + auth middleware + role checks)
        |
        v
Database (users, teams, players, events, game_requests, posts)
```

## Attack surface assessment

| Surface | Threat | Existing mitigation | Gap | Planned fix / status |
| --- | --- | --- | --- | --- |
| Login and signup | Credential stuffing and brute-force login attempts | Generic error messages; password hashing with bcrypt; server-side verification | No rate limiting before the hardening changes | Rate limiting added to `/api/auth/login` and `/api/auth/signup`; limit is env-configurable |
| Session cookie and JWT | Token theft or replay | HttpOnly, SameSite cookie policy, server-side JWT verification, short expiry | Stateless session makes server-side revocation difficult | Continue to keep session expiry short and require strong JWT secrets |
| Team and roster APIs | Broken access control / IDOR | Team access checks, ownership checks, and 404s for non-members | Some APIs rely on role checks rather than explicit per-user auditing | Tests cover cross-team access for owners, coaches, and players |
| Game requests | Accepting a request from the wrong team or double-accepting | Receiver-owner check, row locking, status validation | Needs regression coverage and manual verification | Integration tests cover the primary acceptance/403/409 flows |
| Frontend rendering | XSS from user-controlled input | DOM is built with `textContent` and not `innerHTML` for the app UI | CSP is not yet a full defense-in-depth layer | Keep user data escaped by DOM APIs and keep sanitization in place |
| Database layer | SQL injection | Parameterized queries throughout the application | Default credential fallback removed in DB setup | Keep schema and query validation on parameterized paths only |
| Dependency health | Known CVEs in transitives | `npm audit fix` applied and dependency overrides used where needed | Future package updates still need regular review | `npm audit` must be part of the QA gate |
| Secrets and config | Accidental credential leaks or weak defaults | `.env` is excluded from version control and the app refuses short secrets in production | Seed demo accounts are intentionally weak and limited to local dev | Keep dev-only accounts out of production and document the risk |

## Key assumptions and constraints

- The application runs in a small course project context and is intentionally focused on a small set of authorized users.
- Roster and scheduling data is visible only to members of the relevant team or team staff.
- The primary security goals are preventing unauthorized changes, protecting login endpoints from brute force, and limiting the blast radius of a compromised session.

## Residual risk

The application still relies on stateless JWT sessions and does not implement server-side session revocation or token rotation beyond standard expiry rules. This is acceptable for the current project scope, but a production deployment should evaluate an audit log, stronger session management, and tighter content security policies before broader rollout.
