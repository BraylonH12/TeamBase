# TeamBase

TeamBase is a sports-organization web app for managing teams, rosters, practice schedules, announcements, and game requests.

## Quick start

Use the commands below from a terminal:

```bash
git clone https://github.com/BraylonH12/TeamBase.git
cd TeamBase
npm install
npm start
```

Then open `http://localhost:3000` in a browser.

## Required software

- Node.js 22 or newer. The project was tested on Node 22 and the local environment used for validation was Node 24.19.0.
- A browser with local development access enabled.
- Optional: a PostgreSQL server if you want to point the app at `DATABASE_URL` instead of the embedded PGlite local database.

## Local development database

The app defaults to an embedded PGlite database for local work. It applies migrations automatically on startup and creates a local data folder under `data/pgdata` unless you override it with `PGLITE_DIR` or run under `NODE_ENV=test`.

To reset the local database:

```bash
npm run db:reset
```

## Environment variables

| Variable | Required | Description |
| --- | --- | --- |
| `PORT` | No | HTTP port used by Express. Defaults to `3000`. |
| `DATABASE_URL` | No | Full PostgreSQL connection string. When present, the app uses the `pg` driver instead of PGlite. |
| `JWT_SECRET` | No in development; required in production | Secret used to sign session tokens. In production it must be at least 32 bytes long. |
| `AUTH_RATE_LIMIT_MAX` | No | Number of login/signup attempts allowed per IP per 15 minutes. Defaults to `10` outside tests, and `1000` under `NODE_ENV=test`. |
| `SEED_DEMO` | No | Set to `true` to enable seeded demo data; defaults to automatic seeding in local development. |
| `PGLITE_DIR` | No | Optional custom folder for the embedded local database. |

## Optional: use a real PostgreSQL server

Set `DATABASE_URL` and then run:

```bash
npm run db:migrate
npm start
```

The legacy `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, and `DB_PASSWORD` values are still recognized, but the project no longer ships with default DB credentials.

## Demo accounts

The seeded demo accounts are intended for local demo/testing and should not be used in a public production deployment.

| Role | Email | Password |
| --- | --- | --- |
| Owner | `Owner@email.com` | `123456` |
| Player | `Player@email.com` | `123456` |
| Owner | `Brickhouse@email.com` | `123456` |
| Player | `Michael@email.com` | `654321` |

The owner accounts control the `Warriors` team and the sample roster contains players such as Lebron and Larry.

## Main user flow

- Sign up or log in at `/signup.html` or `/login.html`.
- Create a team as an owner.
- Add players to the roster and assign coaches.
- Post announcements for the team.
- Schedule practice and game events.
- Send or accept game requests.
- Player members can RSVP to events and view the current team schedule.

## Testing

Run the automated checks from the repo root:

```bash
npm test
npm run test:coverage
```

The coverage script emits text, HTML, and LCOV output so the team can track the server route and middleware coverage target.

## Milestone 2 verification

Use this quick verification guide for the TA or reviewer:

| Verify | Command / action |
| --- | --- |
| App starts | `npm install && npm start`, then open `/` |
| Milestone 1 workflow still works | Sign up, log in, create a team, add roster and announcement, create event, send and accept a game request |
| New M2 features work | RSVP as a Player and verify count view as Owner/Coach; edit or remove a roster player |
| Automated tests run | `npm test` and `npm run test:coverage` |
| Security controls observed | Run the rate-limit loop and confirm a `429`, then verify Helmet headers from `curl -sI http://localhost:3000/` |

## Documentation and process

- [CONTRIBUTING.md](./CONTRIBUTING.md)
- [CHANGELOG.md](./CHANGELOG.md)
- [docs/QA_PLAN.md](./docs/QA_PLAN.md)
- [docs/THREAT_MODEL.md](./docs/THREAT_MODEL.md)
- [docs/OWASP_REVIEW.md](./docs/OWASP_REVIEW.md)
- [docs/MILESTONE_2_REPORT.md](./docs/MILESTONE_2_REPORT.md)

## Notes

This project uses PostgreSQL-compatible SQL throughout, while local development runs on embedded PGlite to keep setup simple for demos and class checks.
