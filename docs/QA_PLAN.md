# QA Plan

## Definition of Done
The Milestone 2 work is complete only when all of the following are true:

- `npm test` passes.
- Coverage stays at or above the documented target for server code and middleware (at least 80% line coverage for the server routes/middleware and at least 70% overall, as measured by `npm run test:coverage`).
- The app still works in the primary onboarding flow: signup, login, team creation, roster, announcements, events, and game-request acceptance.
- Security controls are observable and verified (`npm audit` shows no vulnerabilities, rate limiting returns `429`, and Helmet headers are present).
- README, CHANGELOG, and docs are updated and reviewed.
- No secrets or `.env` values are committed to the repository.

## Pull request checklist
Use this in every PR:

- [ ] Branch follows `feat/`, `fix/`, `docs/`, or `test/` naming.
- [ ] Conventional commit message used (`feat:`, `fix:`, `docs:`, `test:`, `chore:`).
- [ ] Tests pass locally: `npm test`.
- [ ] Coverage checked when the change affects server behavior: `npm run test:coverage`.
- [ ] Security-sensitive changes reviewed for auth, database access, and input validation.
- [ ] README or docs updated when behavior changes.
- [ ] No secret material or local `.env` values added.

## Test types and owners

| Test type | What it checks | Owner | Timing |
| --- | --- | --- | --- |
| Unit tests | Route validation, authorization branches, middleware behavior | Developers | During feature implementation |
| Integration tests | Real PGlite DB flows for signup/login, roster, events, requests, and security | Developers | Before merge |
| Manual regression pass | Login, create team, roster, announcement, event scheduling, game request acceptance | Reviewer + developer | Before final PR merge |
| Viewport checks | Responsive behavior at 375px, 768px, and 1280px | Reviewer | Final QA pass |
| Security checks | `npm audit`, rate-limit evidence, header presence | Developer | Before final merge |

## Manual regression checklist
Use this checklist for the Milestone 1 workflow after any backend or frontend change:

1. Create an account as an Owner.
2. Log in and confirm the session cookie is set.
3. Create a team and add at least one Player.
4. Post an announcement.
5. Add a Practice event.
6. Add a Game event or send a game request to another owner.
7. Accept the request as the receiving team owner.
8. Verify the event shows up in both team schedules.
9. As a Player, confirm the roster, schedule, and announcements are visible.
10. Log out and confirm the protected API returns `401` without a valid cookie.

## Evidence and gate for merge
Before a PR is merged, the author must share:

- The command output from `npm test`.
- Coverage summary if the change touches server logic.
- Any manual viewport screenshots or notes for mobile/desktop checks.
- Security evidence for auth or dependency changes.

This plan is intentionally lightweight and is designed to keep the team aligned with the Milestone 2 requirements without slowing down normal feature work.
