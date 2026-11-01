# TeamBase
CS415 Web Application Project:

## Description
Centralized sports organization and athletic management web application.

## Team Members
* Braylon Heavens (<bkheavens@crimson.ua.edu>)
* Eric Smith (<emsmith40@crimson.ua.edu>)

## Tech Stack
* **Frontend:** HTML, CSS, JavaScript
* **Backend:** Node.js, Express
* **Database:** PostgreSQL (embedded PGlite locally; `pg` for a PostgreSQL server)

## Quick Start

Requires Node.js 22 or later. The project was smoke-tested on Node.js 22 during the database spike; this environment's automated tests run on Node.js 24.19.0. No local PostgreSQL installation is needed for development.

```powershell
git clone https://github.com/BraylonH12/TeamBase.git
cd TeamBase
npm install
npm start
```

Open `http://localhost:3000`. Migrations are applied automatically on startup. The embedded PGlite database is stored under `data/pgdata` and demo data is seeded automatically in development. To start over, stop the server and run `npm run db:reset`. Copy `.env.example` to `.env` only if you want to configure optional settings. If `JWT_SECRET` is unset, development startup generates a temporary secret, so login sessions do not survive a server restart.

### Environment variables

| Variable | Required | Description |
| --- | --- | --- |
| `PORT` | No | HTTP port (default `3000`). |
| `DATABASE_URL` | No | PostgreSQL connection string; when set, uses the `pg` driver instead of embedded PGlite. |
| `JWT_SECRET` | No in development; required in production | Secret used to sign authentication tokens; must be at least 32 bytes in production. |
| `AUTH_RATE_LIMIT_MAX` | No | Login/signup attempts per IP per 15 minutes (default `10`; default is `1000` under `NODE_ENV=test`). |
| `SEED_DEMO` | No | Set to `true` to seed demo accounts or `false` to disable seeding. By default, seeds run on embedded development databases only. |
| `PGLITE_DIR` | No | Custom PGlite data directory. Without it, the app uses `data/pgdata` (or an in-memory database under `NODE_ENV=test`). |

### Optional: use a real PostgreSQL server

Set `DATABASE_URL` in `.env` to a PostgreSQL connection string, then run:

```powershell
npm run db:migrate
npm start
```

The app also supports the legacy `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, and `DB_PASSWORD` variables. There are no default database credentials. Migrations previously applied by hand to an existing database must first be recorded in `schema_migrations` (or use a fresh database), because migration 002 is not re-runnable against an already-created schema.

The seed includes these local demo accounts:

| Role | Email | Password |
| --- | --- | --- |
| Owner | `Owner@email.com` | `123456` |
| Player | `Player@email.com` | `123456` |
| Owner | `Brickhouse@email.com` | `123456` |
| Player | `Michael@email.com` | `654321` |

These shared, weak-password accounts are for controlled demo/test environments only; do not keep them on a publicly accessible production deployment.

The Owner account owns the `Warriors` basketball team. The roster contains Lebron (#23, Forward), linked to the Player account, and Larry (#30, Guard).

The login and signup pages are available at `/login.html` and `/signup.html`. Signup creates an Owner, Coach, or Player account with a bcrypt-hashed password; login verifies existing accounts. Successful flows issue an HttpOnly session cookie and navigate to `/home.html`. Authentication also accepts bearer tokens; `GET /api/auth/me` returns the current user and `POST /api/auth/logout` clears the cookie.

## Milestone 1 Verification

Run the automated checks from the repository root:

```powershell
npm test
```

To verify the main workflow manually after cloning:

1. Follow the environment setup instructions above.
2. Go to `/signup.html` to create a new Owner or Player account, or go to `/login.html` to sign in with one of the seeded test accounts.
3. Confirm that a successful login sets the session cookie and redirects to `/home.html`.
4. As an Owner, create a team, add players to its roster, and post a team announcement.
5. As an Owner, schedule an event for that team.
6. As an Owner, send a match request to an opponent team. Sign in as the receiving team's Owner, accept the request, and confirm that a game event appears on both teams' schedules.
7. As a Player, verify that the assigned team's roster, upcoming schedule, and announcements are visible.