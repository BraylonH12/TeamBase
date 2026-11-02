# Changelog

All notable changes to TeamBase are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project uses semantic-version style tags for milestone releases.

## [0.2.0] - 2026-11-01

### Added
- Embedded PGlite-backed local database support with automatic migration tracking.
- RSVP workflow for team events (`Going` / `Can't make it`).
- Ownable roster editing and removal for team owners.
- Owner-only cancellation of team practice events.
- Security and QA documentation: QA plan, threat model, OWASP review, contributing guide, and PR template.
- Coverage tooling and integration tests for the database-backed user flows.

### Changed
- Updated the project README to describe the simplified setup and environment variables.
- Added rate limiting and security headers for auth routes.
- Improved the frontend DOM update path to rely on `textContent`-style safe rendering patterns.

### Security
- Added `Helmet` and login/signup rate limiting.
- Removed insecure fallback DB credentials and tightened JWT secret validation in production.
- Re-ran dependency audit and resolved the known vulnerable path.

## [0.1.0] - 2026-10-28

### Added
- Initial TeamBase MVP with user authentication, team management, roster features, announcements, scheduling, and game requests.
- Seeded demo accounts for local testing.

### Changed
- Established the initial README, app structure, and starter workflows.
