# TeamBase: Milestone 2 ("Test It") Plan

**Due:** Monday, Nov 2, 2026 (night)  **Written:** Sunday, Nov 1, 2026
**Based on:** repo `BraylonH12/TeamBase` at commit `6d30115` (tag `milestone-1`) and the Project Milestones document.

Milestone 2 must **build on Milestone 1 and contain a working application with additional completed features**. A test plan or documentation alone is not enough. This file covers what is missing, how to simplify the database setup, who does what, and a submission checklist.

---

## 1. Where you stand

Baseline measured today from a fresh `npm ci` (Node 22): `npm test` passes **14/14**. Existing tests mock `db.query`, so none of them touches a real database.

| # | Milestone 2 requirement | Current state | Action |
|---|---|---|---|
| 1 | Evidence of peer code review | History shows merge commits for PRs #4 and #5, but no visible review/approval. 13 of 14 commits are from one person. | Every M2 change goes through a PR approved by the *other* member (Section 4A). |
| 2 | QA plan or checklist | None in repo. | Write `docs/QA_PLAN.md` (4B). |
| 3 | Unit tests, coverage report, justified target | 14 tests, no coverage tooling. Per-file line coverage: `gameRequests.js` **12.9%**, `teams.js` **45.1%**, `db.js` 47.8%, `routes/auth.js` 86.0%, `middleware/auth.js` 78.3%. (The 63.8% "all files" figure includes the test file itself at 97.7%, so real source coverage is lower.) | Add coverage tooling, more tests, state a target (4C). |
| 4 | Integration tests for main user flows | None; all DB-touching tests are mocked. | Add real-database integration tests (4D). |
| 5 | Cross-viewport / cross-platform evidence | Viewport meta tag is on all 4 pages, but only 3 `@media` rules exist (all in `dashboard.css`; `styles.css`, used by login/signup/index, has none). | Test at 3 widths, fix defects, keep screenshots (4E). |
| 6 | Threat model | None. | `docs/THREAT_MODEL.md` (4F). |
| 7 | At least one implemented security control | M1 already has bcrypt (cost 12), HttpOnly + SameSite cookie, parameterized SQL, role/ownership checks. Nothing new. | Add 3 cheap new controls with before/after evidence (4G). |
| 8 | OWASP Top 10 review | None. | `docs/OWASP_REVIEW.md` (4H). |
| 9 | Before/after evidence for security fixes | None. `npm audit` currently reports **2 vulnerabilities** (`body-parser` <1.20.9 high, `qs` moderate), both fixable with `npm audit fix`. | Capture "before" first, then fix (4G). |
| 10 | Documented branching and commit conventions | Not documented (commits informally use `feat:`). | `CONTRIBUTING.md` (4I). |
| 11 | Changelog + at least two tagged releases | No changelog. Only tag is `milestone-1`. | `CHANGELOG.md`, tags `v0.1.0` and `v0.2.0` (4I). |
| 12 | Additional completed features | Backlog US-01 to US-04 are all already in M1. | Two new user stories (4J). |
| 13 | Runnable-version requirement | README exists but setup is long and Windows-only. Demo-account table omits two seeded accounts. | DB simplification (Section 2) + README updates (Section 6). |
| 14 | Demo, contribution statements, `milestone-2` tag | Not done. | Section 7. |

---

## 2. Simplifying the database setup

### 2.1 Why setup is hard today

- Requires installing PostgreSQL, getting `psql` on `PATH`, creating a `teambase` database, and putting your own `postgres` password in `.env`.
- Requires hand-running three migrations in order, exactly once. Migration `002` is not re-runnable (`CREATE TABLE` without `IF NOT EXISTS`, plain `ADD CONSTRAINT`), so a mistake means a broken DB.
- Signup/login fail with a 503 if `JWT_SECRET` is unset or the DB password is wrong.
- `db.js` silently falls back to user `postgres` / password `postgres`.

### 2.2 Options

| Option | Setup for a TA | Code change | Verdict |
|---|---|---|---|
| **A. Embedded Postgres (PGlite) with real-Postgres fallback** | `npm install && npm start` | Small: rewrite `server/config/db.js`, add a migration runner. Routes, SQL, and schema stay the same. | **Recommended** |
| B. Docker Compose + Postgres | Install Docker Desktop, `docker compose up` | Small (compose file + auto-migrate) | Good for Milestone 3 ("containerized services"), but Docker Desktop is itself a heavy dependency. Add later, not now. |
| C. Hosted Postgres (Neon, Supabase, etc.) via `DATABASE_URL` | No local install, but you must hand the TA credentials | Tiny (`DATABASE_URL` support) | Fine as the Milestone 3 deployment DB. Poor for reproducibility: depends on an outside service and shared secrets. |
| D. SQLite | `npm install` | **Large.** `$1` placeholders, `SERIAL`/identity columns, `FOR UPDATE OF`, `TIMESTAMPTZ`, `ALTER TABLE ... ADD CONSTRAINT` in migrations 002/003, and Postgres error codes (`23505`, `23503`) are all used by the current code. | Not worth the regression risk with one day left. |

### 2.3 Developer Choice: Option A

PGlite is PostgreSQL compiled to WebAssembly and runs inside the Node process. When `DATABASE_URL` is set the app uses the normal `pg` pool, so the same code works against a real PostgreSQL server for deployment in Milestone 3.

**What I verified** (scratch test outside your repo, PGlite 0.5.14, Node 22, against your real files):
- All three migrations and the seed run unchanged. Running the seed twice still yields 4 users (idempotent).
- Unique violation returns code `23505` and foreign-key violation returns `23503`, so your existing `error.code` handling still works.
- `db.transaction(async (tx) => tx.query(...))` works, including `SELECT ... FOR UPDATE OF gr` (the game-request accept flow).
- `DATE`/`TIMESTAMPTZ` columns come back as JS `Date` objects, same as `pg`. `rowCount` is populated on `SELECT`.
- Persisting to a data directory and reopening it keeps data (39 MB on disk). Migrate + seed takes roughly 70-150 ms.

**Not yet verified (the integration tests in 4D will cover these):** `rowCount` on `DELETE`/`UPDATE`, and the full app running end-to-end on PGlite.

**Known differences and limits**
- `BIGINT` ids come back as JS numbers in PGlite but as strings in `pg`. Your code already compares with `String(...)` in the places I checked, and the sketch below makes the `pg` path match.
- PGlite has a single connection and is pre-1.0 (0.5.x). Fine for a course project and demos; use real PostgreSQL for deployment.
- This is a library choice, not a schema change. The Milestone 0 proposal says PostgreSQL, and that stays true: it is the same SQL on a real Postgres server. Record it as an ADR (`docs/adr/002-embedded-postgres-for-local-dev.md`) so the change is documented rather than silent.

### 2.4 Implementation steps (Braylon, about 2-3 hours, estimate)

- [ ] `npm install @electric-sql/pglite`
- [ ] Rewrite `server/config/db.js` as a driver switch (sketch below). **Keep the exports `query`, `connect`, `disconnect`, `transaction`** so route code and the tests that monkeypatch `db.query` keep working.
- [ ] Add a tracked migration runner (`schema_migrations` table) so migrations apply automatically and exactly once. Run seeds automatically in dev only.
- [ ] Call `await db.connect()` in `server.js` before `listen` (inside the `require.main === module` block) so DB errors surface at startup.
- [ ] Dev-only `JWT_SECRET`: if unset and `NODE_ENV !== 'production'`, generate a random one at startup with a console warning; in production, exit with an error. Put this in the start block, **not at import time**, so existing tests are unaffected.
- [ ] Add `data/` to `.gitignore`. Add npm scripts `db:reset` (delete `data/pgdata`) and `db:migrate` (for a real Postgres).
- [ ] Rewrite `.env.example` (everything optional) and the README quick start (Section 6).
- [ ] Add `docs/adr/002-embedded-postgres-for-local-dev.md`.
- [ ] Remove the `postgres`/`postgres` credential fallback (OWASP: security misconfiguration).

Sketch (PGlite calls follow the spike; the surrounding code is untested):

```js
// server/config/db.js
require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '../..');
const usePostgres = Boolean(process.env.DATABASE_URL || process.env.DB_HOST);
let ready; // created lazily so importing this file in unit tests stays fast

async function create() {
  if (usePostgres) {
    const { Pool, types } = require('pg');
    types.setTypeParser(20, Number); // BIGINT -> number, matching PGlite
    const pool = new Pool(process.env.DATABASE_URL
      ? { connectionString: process.env.DATABASE_URL, max: 10 }
      : { host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 5432),
          database: process.env.DB_NAME || 'teambase',
          user: process.env.DB_USER, password: process.env.DB_PASSWORD, max: 10 });
    return {
      query: (text, params) => pool.query(text, params),
      exec: (sql) => pool.query(sql),
      transaction: async (fn) => { /* keep your existing BEGIN/COMMIT/ROLLBACK code */ },
      close: () => pool.end(),
    };
  }
  const { PGlite } = await import('@electric-sql/pglite');
  const dir = process.env.PGLITE_DIR
    || (process.env.NODE_ENV === 'test' ? undefined : path.join(ROOT, 'data/pgdata')); // undefined = in memory
  const pg = new PGlite(dir);
  await pg.waitReady;
  return {
    query: (text, params) => pg.query(text, params),
    exec: (sql) => pg.exec(sql),
    transaction: (fn) => pg.transaction(fn), // tx.query(...) matches client.query(...) in gameRequests.js
    close: () => pg.close(),
  };
}

async function migrate(d) {
  await d.exec('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())');
  const done = new Set((await d.query('SELECT name FROM schema_migrations')).rows.map((r) => r.name));
  const dir = path.join(ROOT, 'db/migrations');
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.sql')).sort()) {
    if (done.has(f)) continue;
    await d.exec(fs.readFileSync(path.join(dir, f), 'utf8'));
    await d.query('INSERT INTO schema_migrations (name) VALUES ($1)', [f]);
  }
}

async function init() {
  const d = await create();
  await migrate(d);
  const seed = process.env.SEED_DEMO
    ? process.env.SEED_DEMO === 'true'
    : !usePostgres && process.env.NODE_ENV !== 'production';
  if (seed) { /* d.exec() each file in db/seeds (idempotent) */ }
  return d;
}

const driver = () => (ready ??= init());
module.exports = {
  query: async (text, params) => (await driver()).query(text, params),
  transaction: async (fn) => (await driver()).transaction(fn),
  connect: async () => { await driver(); },
  disconnect: async () => { if (ready) { await (await ready).close(); ready = undefined; } },
};
```

**Watch out:** a teammate whose local Postgres already had migrations applied by hand would have the runner re-run `001`-`003` and fail on `002`. Either have them drop and recreate the DB, or insert the three filenames into `schema_migrations` once. Teammates who just use the embedded DB are unaffected. Also note that an existing `.env` copied from the old `.env.example` contains `DB_HOST=localhost`, which makes the app keep using PostgreSQL; delete the `DB_*` lines (or the whole `.env`) to switch to the embedded database.

**Acceptance test for this change:** Eric deletes any local Postgres config, clones fresh into a new folder, runs `npm install && npm start`, signs up, logs in, and logs in as `Owner@email.com`. If that works, the TA's experience will too.

---

## 3. Split and timeline

Git history shows 13 of 14 commits from `BraylonH12` (under two identities) and 1 from `Flareus9` (I'm assuming that is Eric). The course treats a sustained imbalance as a possible individual grade adjustment, so this plan gives Eric whole, self-contained pieces with his own PRs. Check that each person's `git config user.email` matches their GitHub account so commits are attributed correctly.

| Area | Braylon | Eric |
|---|---|---|
| Database swap + README quick start | **Owner** | Reviews, then fresh-clone acceptance test |
| Process docs (QA plan, CONTRIBUTING, CHANGELOG, backlog update) | Reviews | **Owner** |
| Responsive fixes + viewport screenshots | Reviews | **Owner** |
| Integration test harness + flows 1, 3 | **Owner** | Reviews |
| Security controls + before/after evidence | **Owner** | Reviews |
| Threat model + OWASP review | Reviews and supplies evidence | **Owner** (draft) |
| Feature US-05 (RSVP) | Reviews | **Owner** (backend, frontend, tests) |
| Feature US-06 (roster edit/remove) | **Owner** | Reviews |
| Unit tests to reach coverage target | Routes: `gameRequests`, `auth` | Routes: `teams`, middleware |
| Demo, final README, tags, release | Shared | Shared |

**Sunday**
- 9:00 Kickoff, 30 min: confirm plan and features, create GitHub issues under a "Milestone 2" label, turn on branch protection for `main` (require a PR and 1 approval; the repo is public, so this is available).
- 9:30-1:00 Braylon: PR `feat/embedded-db`. Eric: PR `docs/process` and PR `fix/responsive-auth-pages` (neither needs the database).
- **Before merging the security PR, capture the "before" evidence** (4G).
- 1:00-2:00 Cross-review and merge. Eric runs the fresh-clone acceptance test.
- 2:00-7:00 Braylon: integration harness + security controls. Eric: US-05 on top of the new DB (migration `004`).

**Monday**
- Morning: finish US-06, push coverage to target, Eric drafts threat model + OWASP review, Braylon reviews.
- Noon-3:00 Cross-viewport pass, README finalization, changelog.
- **3:00 feature freeze.**
- 3:00-5:00 Clean-clone dry run, demo rehearsal.
- 5:00-6:00 Tags, GitHub release, push, verify tags on GitHub.
- Submit with buffer before the deadline.

---

## 4. Requirement checklists

### 4A. Peer code review evidence
- [ ] Branch protection on `main`: require PR, require 1 approval.
- [ ] Every M2 change merges via PR reviewed by the other member, with at least one real review comment on each substantial PR.
- [ ] Record the PR links in `docs/evidence/code-review/README.md` with a one-line note on what the review caught.

### 4B. QA plan (`docs/QA_PLAN.md`)
- [ ] Definition of Done (tests pass, coverage not below target, reviewed by the other member, README/CHANGELOG updated, `npm audit` clean, no secrets committed).
- [ ] PR checklist (copy into `.github/pull_request_template.md`).
- [ ] Test types used: unit, integration, manual viewport, security checks, and who runs each and when.
- [ ] Manual regression checklist for the Milestone 1 workflow (Section 7 reuses it).

### 4C. Unit tests and coverage
- [ ] Add `c8` as a devDependency. Suggested script: `"test:coverage": "c8 --reporter=text --reporter=html --reporter=lcov --exclude 'tests/**' node --test"`. Excluding `tests/` removes the inflated 97.7% line from the report.
- [ ] `coverage/` is gitignored, so copy the text summary to `docs/evidence/coverage/summary.txt` (and screenshot if you like).
- [ ] Add tests for the gaps: `gameRequests.js` (send, accept/reject, wrong owner 403, not pending 409, not found 404), `teams.js` validation and authorization branches, `middleware/auth.js` edge cases (expired/garbage token, non-numeric `sub`, deleted user).
- [ ] **State a target and justify it.** Suggested: at least 80% line coverage for `server/` routes and middleware, 70% overall. Justification: authorization and the game-acceptance transaction live in the server; the frontend is verified manually (4E).

### 4D. Integration tests (real database, in memory)
With Section 2 done, tests run against an in-memory PGlite (`NODE_ENV=test`) and need no installed Postgres. Put them in `tests/integration/*.test.js` (`node --test` picks up `*.test.js`). Use `fetch` like the existing tests.

| ID | Flow | Key assertions |
|---|---|---|
| IT-1 | Signup, login, `/me`, logout | Cookie set, 409 on duplicate email, `/me` 401 after logout |
| IT-2 | Owner creates team, adds roster, posts announcement, schedules event; linked Player sees them | Player gets 200 with roster/events/posts; non-member gets 404 |
| IT-3 | Game request: send, receiving Owner accepts | Game event appears on **both** teams; second accept returns 409; wrong Owner returns 403 |
| IT-4 | Coach assigned by Owner | Coach can schedule practice and post; gets 403 for Games and roster; 404 on other teams |
| IT-5 | New features (US-05, US-06) | Per acceptance criteria below |
| IT-6 | Security controls | Login rate limit returns 429; security headers present |

Also verify here that `rowCount` works on `DELETE`/`UPDATE` (used by coach removal) since that was not checked in the spike.

### 4E. Cross-viewport testing
- [ ] Test `index`, `login`, `signup`, and `home` (as Owner, Coach, Player) at **375**, **768**, and **1280** px using Chrome DevTools device mode. Do a quick pass in a second browser (Firefox or Edge) for the cross-platform angle.
- [ ] Record defects found, fix them (login/signup/index likely need `@media` rules since `styles.css` has none), and save before/after screenshots in `docs/evidence/viewport/`.
- [ ] Table in the evidence README: page x width x pass/fail x notes.

### 4F. Threat model (`docs/THREAT_MODEL.md`)
Include a data-flow sketch (browser, Express API, database) and a table per attack surface with threat, existing mitigation, gap, and planned fix. Starter content from what the code does today:

| Surface | Threat | Existing mitigation | Gap |
|---|---|---|---|
| Login/signup | Credential stuffing, brute force | bcrypt cost 12, generic "Invalid email or password" | No rate limiting; signup reveals existing emails (409) |
| Session cookie (JWT) | Theft, CSRF | HttpOnly, SameSite=Lax, 1-hour expiry, `secure` in production | Stateless, so no server-side revocation on logout; weak `JWT_SECRET` not rejected |
| Team/roster/event/post APIs | Broken access control, IDOR | Role checks, ownership checks, 404 for non-members | `GET /api/teams` lists all teams (id/name/sport) to any logged-in user (needed for opponent picker); needs cross-team tests |
| Game requests | Accepting someone else's request, double-accept | Receiver-owner check, `FOR UPDATE` row lock, status check | Needs integration tests |
| Frontend | XSS from user-entered text | DOM built with `textContent` (17 uses); I found no `innerHTML` in `frontend/js` | No CSP yet |
| Database | SQL injection | All queries I read are parameterized | Credential fallback in `db.js` (fixed in Section 2) |
| Dependencies | Known CVEs | None | `body-parser` (high), `qs` (moderate) |
| Config/secrets | Leaked or default secrets | `.env` gitignored | Seed accounts use weak passwords (`123456`); keep out of production |

### 4G. Security controls with before/after evidence
Implement these three (all small), ordered by effort:

1. **Dependency fix.** `npm audit fix`, then run the tests. Before: save today's `npm audit` output. After: `found 0 vulnerabilities`.
2. **Login/signup rate limiting** with `express-rate-limit` (for example 10 attempts per 15 minutes per IP). Make the limit configurable through an env var, because the existing tests call login several times and integration tests will call it more. Add `app.set('trust proxy', 1)` when you deploy behind a proxy in Milestone 3.
3. **Security headers** with `helmet`. Your four HTML pages load only external scripts from `./js/` and use no inline `<script>`, `<style>`, or `style=` attributes, so Helmet's default CSP should work. If you load fonts or images from a CDN, allow them in the CSP. Also remove `express.urlencoded(...)`: login and signup submit JSON via `fetch`, so it is unused attack surface. Enforce a minimum `JWT_SECRET` length in production.

**Evidence (capture "before" on current `main` first):**
- Headers: `curl -sI http://localhost:3000/`
- Rate limit, bash: `for i in $(seq 1 15); do curl -s -o /dev/null -w "%{http_code}\n" -X POST -H 'content-type: application/json' -d '{"email":"a@b.co","password":"wrongpass1"}' http://localhost:3000/api/auth/login; done`
- Rate limit, PowerShell: `1..15 | % { try { (Invoke-WebRequest http://localhost:3000/api/auth/login -Method Post -ContentType 'application/json' -Body '{"email":"a@b.co","password":"wrongpass1"}' -UseBasicParsing).StatusCode } catch { $_.Exception.Response.StatusCode.value__ } }`
- Before: all `401`. After: `401`s then `429`s.
- Save outputs in `docs/evidence/security/` as numbered files (`01-audit-before.txt`, `02-audit-after.txt`, and so on). The README must say how a TA can observe the control (Section 7).

### 4H. OWASP Top 10 review (`docs/OWASP_REVIEW.md`)
Use the numbering of the OWASP version your course uses (the 2021 category names are below). For each relevant category give: status, evidence, and action.

| Category | Assessment |
|---|---|
| Broken Access Control | Strong role + ownership checks; tests for cross-team access (IT-2/3/4); document the `GET /api/teams` decision |
| Cryptographic Failures | bcrypt cost 12, 72-byte guard; enforce `JWT_SECRET` strength in production; cookie `secure` in production |
| Injection (incl. XSS) | Parameterized SQL; `textContent` rendering; add a test that an announcement containing `<script>` is returned as data and rendered inert |
| Insecure Design | Rate limiting added; weak seed accounts limited to dev |
| Security Misconfiguration | Helmet added, default DB credentials removed, unused body parser removed |
| Vulnerable and Outdated Components | `npm audit fix`; add `npm audit` to the QA checklist |
| Identification and Authentication Failures | Rate limiting; document 1-hour stateless sessions and no lockout |
| Logging and Monitoring Failures | Only `console.error` today; optionally log failed logins |
| Software/Data Integrity, SSRF | Document as not applicable (no deserialization, no outbound requests) |

### 4I. Conventions, changelog, releases
- [ ] `CONTRIBUTING.md`: branch names (`feat/`, `fix/`, `docs/`, `test/`), Conventional Commit messages (`feat:`, `fix:`, `docs:`, `test:`, `chore:`), PR rules (one approval, tests green), Definition of Done link.
- [ ] `CHANGELOG.md` in Keep a Changelog format with `[0.1.0]` (Milestone 1) and `[0.2.0]` (Milestone 2).
- [ ] Tag the Milestone 1 commit retroactively as the first release: `git tag -a v0.1.0 milestone-1 -m "Milestone 1 MVP"`.
- [ ] At the end: `git tag -a v0.2.0 -m "Milestone 2"` and `git tag -a milestone-2 -m "Milestone 2"`. Push all tags and create GitHub Releases for `v0.1.0` and `v0.2.0`. (`v1.0` is reserved for Milestone 3.)

### 4J. Additional features
Backlog statuses are still `---`. Mark US-01 to US-04 as Done and add:

- **US-05 (High, 3 pts):** As a Player, I want to RSVP "Going" or "Can't make it" to an event so my coach knows who is attending.
  - New table `event_rsvps(event_id, user_id, status, updated_at)` in migration `004`; `PUT /api/teams/:teamId/events/:eventId/rsvp`; `GET .../events/:eventId/rsvps` (Owner/Coach see all, Player sees own).
  - Acceptance: Player can set and change an RSVP; staff see counts and names; a non-member gets 404; invalid status gets 400.
- **US-06 (Medium, 2 pts):** As an Owner, I want to edit or remove roster players and cancel practices so team information stays accurate.
  - `PATCH`/`DELETE /api/teams/:teamId/roster/:playerId`; `DELETE` for Practice events.
  - Acceptance: only the team Owner can do this; Coaches get 403; removing a player does not delete their user account.
- *Stretch:* Owner cancels a Pending game request. Cut first if time runs short.

---

## 5. Files to create

```
CONTRIBUTING.md
CHANGELOG.md
.github/pull_request_template.md
docs/QA_PLAN.md
docs/THREAT_MODEL.md
docs/OWASP_REVIEW.md
docs/adr/002-embedded-postgres-for-local-dev.md
docs/MILESTONE_2_REPORT.md        # submission summary: links, contribution statements, verification guide
docs/evidence/code-review/README.md
docs/evidence/coverage/summary.txt
docs/evidence/security/            # before/after files
docs/evidence/viewport/            # screenshots + results table
db/migrations/004_create_event_rsvps.sql
tests/integration/*.test.js
```

The repo contains no Milestone 1 design artifacts (use cases, wireframes, ADR). If you submitted those elsewhere, ignore this. If not, Milestone 3 allows completing unfinished Milestone 1 or 2 items, so it is not an M2 blocker, but add them to `docs/` when you can.

---

## 6. README updates

- [ ] Quick start at the top: `git clone ... && cd TeamBase && npm install && npm start`, then open `http://localhost:3000`. Move the PostgreSQL instructions to an "Optional: use a real PostgreSQL server" section (`DATABASE_URL`, `npm run db:migrate`).
- [ ] Required software and versions: state the Node version you actually test with (the spike ran on Node 22) and consider `"engines"` in `package.json`.
- [ ] Give commands for macOS/Linux as well as Windows PowerShell. The TA may not be on Windows.
- [ ] Environment variable table: `PORT`, `DATABASE_URL` (optional), `JWT_SECRET`, `SEED_DEMO`, `PGLITE_DIR`.
- [ ] Migrations and seeds: "applied automatically on start; `npm run db:reset` to start over."
- [ ] Demo accounts: add the two missing seeded accounts (`Brickhouse@email.com` Owner / `123456`; `Michael@email.com` Player / `654321`) and a Coach account if you add one to the seed.
- [ ] Test commands: `npm test`, `npm run test:coverage`.
- [ ] Replace "Milestone 1 Verification" with **"Milestone 2 Verification"** (Section 7).
- [ ] Link `CONTRIBUTING.md`, `CHANGELOG.md`, and the `docs/` files.

---

## 7. Final submission checklist

**Verification guide for the TA** (put in the README; maps to the five "TA must be able to verify" items):

| TA must verify | Command / steps |
|---|---|
| App starts | `npm install && npm start`, open `/` |
| Milestone 1 workflow still works | Existing steps 1-7 from the README (signup/login, create team, roster, announcement, event, game request accept) |
| New M2 features work | RSVP as Player and view counts as Owner/Coach; edit/remove a roster player |
| Automated tests run | `npm test` and `npm run test:coverage` |
| Security control observable | Rate-limit loop from 4G returns 429; `curl -sI` shows Helmet headers; `npm audit` reports 0 vulnerabilities |

**Before submitting**
- [ ] Delete `node_modules/` and `data/`, clone fresh into a new folder, follow only the README, and confirm everything above works.
- [ ] All tests pass; coverage report meets the stated target.
- [ ] `npm audit` is clean.
- [ ] No `.env` or secrets committed.
- [ ] `CHANGELOG.md` has `[0.1.0]` and `[0.2.0]`; tags `v0.1.0`, `v0.2.0`, `milestone-2` are pushed and visible on GitHub.
- [ ] Contribution statements, one or two sentences per member, in `docs/MILESTONE_2_REPORT.md`. Base them on `git shortlog -sn milestone-1..milestone-2` plus the PR list; commit counts are a conversation starter, not a grading formula.
- [ ] Demo rehearsed (about 5 minutes): fresh start, login, new features, run tests/coverage, show the rate-limit evidence.
- [ ] Confirm the submission format with your instructor or TA. The milestone document lists deliverables but does not say how Milestone 2 is submitted (LMS upload vs. repo link).

---

## 8. Risks and cut line

If time runs short, cut in this order: stretch feature, second-browser pass, US-06, Helmet. **Do not cut:** runnable version, integration tests and coverage report with a stated target, at least one security control with before/after evidence, threat model, OWASP review, reviewed PRs, changelog with two tags, at least one new feature, contribution statements, and the `milestone-2` tag.

| Risk | Mitigation |
|---|---|
| DB swap hits an unexpected snag | Timebox to early afternoon Sunday. Fallback: keep PostgreSQL and add only the migration runner plus `DATABASE_URL`; the rest of the plan is unaffected. |
| Rate limit breaks existing tests | Make the limit env-configurable and high under `NODE_ENV=test`. |
| Helmet CSP blocks a page | Check the browser console on all four pages; relax the specific directive rather than disabling CSP. |
| Work lands unevenly | Review the split at the Sunday 2:00 and Monday noon check-ins. |

*Tip for Milestone 3:* it requires a record of any AI-assisted workflow (what you asked, and what you accepted, edited, or rejected). Keep notes as you go.
