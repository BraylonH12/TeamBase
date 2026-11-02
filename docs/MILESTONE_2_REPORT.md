# Milestone 2 Report

## Submission summary

This milestone focused on making the app runnable and testable with a simplified development database, more reliable coverage, and the required security and documentation work.

### Added and updated work
- Simplified local database startup with embedded PGlite and migration tracking.
- Added integration tests, route coverage, and a coverage script.
- Added security controls with dependency and auth hardening.
- Added the Phase 4 RSVP and roster management features.
- Added the Phase 5 QA, threat model, OWASP, contribution, and changelog documentation.

## Verification guide

Run these steps from the repository root:

```bash
npm install
npm test
npm run test:coverage
npm start
```

Then verify the main workflow manually in a browser:

1. Sign up or log in.
2. Create a team and add a roster player.
3. Post an announcement.
4. Schedule a practice and a game request.
5. Accept the request as the receiving owner.
6. Confirm the event appears in both schedules.
7. As a player, update an RSVP and verify the owner or coach can view the attendance.

## Contribution statements

- Braylon: I focused on the database simplification, test harness, and the backend reliability work needed to keep the app stable during Milestone 2.
- Eric: I focused on the documentation, responsive UI checks, and feature execution around the user-facing flows and QA evidence for the milestone.

## PR and review notes

- Use the project PR template in [../.github/pull_request_template.md](../.github/pull_request_template.md).
- Follow the branch and commit conventions in [../CONTRIBUTING.md](../CONTRIBUTING.md).
- Use the project QA checklist in [QA_PLAN.md](./QA_PLAN.md) before merging.
