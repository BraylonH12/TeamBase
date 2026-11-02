# OWASP Top 10 Review

This review uses the OWASP Top 10 (2021) categories and reflects the current Milestone 2 status of TeamBase.

| Category | Assessment | Evidence | Action |
| --- | --- | --- | --- |
| A01 Broken Access Control | Status: Strong | Team routes enforce roster membership and ownership checks, and integration tests verify cross-team access fails with `404` or `403`. | Keep role/ownership checks intact and continue to test cross-team access when adding new routes. |
| A02 Cryptographic Failures | Status: Good | Password hashing uses bcrypt, JWT secrets are validated in production, and cookies are set with `HttpOnly` and `SameSite` protections. | Keep the `JWT_SECRET` minimum-length guard and document the configuration requirement in the README. |
| A03 Injection | Status: Good | Queries are parameterized and the frontend uses DOM creation with `textContent` rather than `innerHTML`. | Keep parameterized SQL as a mandatory rule and add regression tests for user-generated content rendering. |
| A04 Insecure Design | Status: Improved | Rate limiting is enforced on login/signup, and weak demo accounts are limited to dev/test usage. | Continue to document the trust boundary between local demo accounts and production deployment. |
| A05 Security Misconfiguration | Status: Improved | Helmet is enabled, unused URL encoding is removed, and the old DB credential fallback was removed. | Keep environment variables explicit and review startup behavior before deployment. |
| A06 Vulnerable and Outdated Components | Status: Improved | `npm audit` is part of the QA workflow and the dependency set was remediated with `npm audit fix` and overrides. | Keep `npm audit` as part of every pre-merge check. |
| A07 Identification and Authentication Failures | Status: Good | Login and signup are rate-limited and sessions expire in a controlled way; the app avoids password reuse patterns in the demo seed. | Document the fact that this is a stateless JWT system with no server-side lockout or token revocation list. |
| A08 Software and Data Integrity Failures | Status: Not applicable | The app does not deserialize untrusted data or make outbound remote requests that could alter backend state. | No action beyond routine dependency maintenance. |
| A09 Security Logging and Monitoring Failures | Status: Minimal | The application logs server errors via `console.error` and could benefit from failed-login logging. | Optionally add logging for repeated failed auth attempts in a later hardening pass. |
| A10 SSRF | Status: Not applicable | The app does not make outbound network requests based on user input. | No direct action required. |

## Summary
The application has improved materially for the Milestone 2 timeline: access checks are stronger, the database setup is cleaner, and security controls were added without broad schema churn. The residual risk is mostly in operational hardening, session management, and documentation rather than in the core business logic.
