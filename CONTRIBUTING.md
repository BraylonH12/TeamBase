# Contributing

## Branching and naming

Use branch names in the format below:

- `feat/...` for features
- `fix/...` for bug fixes
- `docs/...` for documentation updates
- `test/...` for tests and coverage work

Examples:

- `feat/rsvp-workflow`
- `fix/login-rate-limit`
- `docs/qa-plan`
- `test/integration-flow-coverage`

## Commit message convention

Use Conventional Commits:

- `feat: add RSVP workflow`
- `fix: reject malformed JWTs`
- `docs: update QA plan`
- `test: add PGlite integration coverage`
- `chore: update dependency overrides`

## Pull request requirements

- Open a PR with a clear summary and testing notes.
- Require one approval from the other team member before merging.
- Keep the PR focused on one area of work.
- Ensure the branch is passing tests before requesting review.

## Definition of Done

A change is done only when:

- `npm test` passes.
- Any behavior change is documented.
- Security-sensitive changes are checked for auth, validation, and dependency impact.
- The relevant docs are updated and the PR reflects the work accurately.

See [docs/QA_PLAN.md](./docs/QA_PLAN.md) for the project QA checklist.
