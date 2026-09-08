# Local development

## Requirements

- Node.js 24 LTS (24.19 or later within Node 24)
- pnpm 11.19.0
- Docker Desktop running Linux containers

Install pnpm with `npm install --global pnpm@11.19.0` if needed.

## First run

Run these commands from the repository root:

```sh
pnpm env:setup
pnpm install
pnpm db:up
pnpm db:generate
pnpm db:migrate
pnpm dev
```

The environment setup command preserves an existing `.env`. The sample credentials are for the local database only. The database and application listeners bind to the local machine by default.

- Web: <http://127.0.0.1:3000>
- API liveness: <http://127.0.0.1:3001/health/live>
- API readiness: <http://127.0.0.1:3001/health/ready>
- API documentation: <http://127.0.0.1:3001/docs>
- OpenAPI JSON: <http://127.0.0.1:3001/openapi.json>

Readiness returns 503 if PostgreSQL is unavailable or the vector extension has not been migrated. Liveness remains independent of the database.

The worker starts as an idle process with graceful shutdown. It does not claim jobs or call a model yet. Domain models and routes will be added with their corresponding features.

## Testing policy

Every new or changed feature must include appropriate automated tests in the same change, across the web, API, worker, shared packages, database and AI integrations. Every bug fix must include a regression test.

Test expected behavior, meaningful edge cases and failures. Include authorization and data isolation checks where applicable. Choose unit, integration or browser tests for the behavior being changed, and validate configuration, migrations and scripts with appropriate automated checks. Assertions should verify requirements and observable outcomes.

A feature or fix is complete when its tests and the relevant local and CI checks pass. Required checks must pass before merging into develop or main. Use synthetic data and isolated services, with controlled AI responses in ordinary CI.

## Checks

```sh
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:integration
pnpm exec playwright install chromium
pnpm test:e2e
```

Integration tests require the migrated local database. Browser tests start isolated API and web processes on ports 3331 and 3330 with a separate PostgreSQL schema; the development app can stay running. Mailpit must be available on port 8025. A teardown removes the exact schema created for each browser test run, including on Windows. Unit tests exercise the HTTP contract and failure handling without a database. Jest uses Node's VM module flag to load NestJS ESM dependencies in its isolated test environment; this flag is not used by the running applications.

Run `pnpm api:generate` after changing API DTOs or routes. Commit the OpenAPI document and generated client types together. Client applications depend on the API contract, not Prisma entities.

## GitHub Actions

The CI workflow runs on every branch push and pull request. Once the workflow is on the default branch, it can also be started manually from the Actions tab.

GitHub provides a fresh Ubuntu runner with a temporary PostgreSQL/pgvector service. CI installs the locked dependencies, validates migrations and the generated API contract, checks formatting and types, runs the API and database tests, builds the applications, and tests the web page with Chromium.

Check the repository's Actions tab for the result of each run and the failing step, if any. CI uses synthetic configuration and does not connect to the local development database.

## Branches and releases

Keep two long-lived protected branches: `main` contains the stable release baseline and `develop` integrates the next version for acceptance testing. Start focused `feature/`, `fix/`, `chore/` or `docs/` branches from current develop and open pull requests into develop. Keep experiments on their own branches until they are ready to review.

Run all local CI-equivalent checks before opening or updating a pull request. Both target branches require an up-to-date source branch, successful GitHub Actions Quality checks and resolved review conversations. Direct pushes, force pushes and deletion of either long-lived branch are blocked; there are no bypass actors. Review uses the owner's single account, so external approvals are not required.

Squash feature pull requests into develop. After acceptance, promote develop through a separate pull request into main using a merge commit, then synchronize main back into develop through a merge-commit pull request. Keeping merge ancestry avoids replaying previously released changes. Main accepts merge commits; develop also allows them for synchronization. Delete only finished short-lived branches. Create immutable version tags from verified main when a release is authorized.

A branch is not a deployed environment. A future staging deployment will track develop and use separate data and credentials; production will track accepted releases from main. Deployment is configured and authorized separately.

## Workspace

- `apps/web`: Next.js interface.
- `apps/api`: NestJS/Fastify API, health checks and Prisma access.
- `apps/worker`: background-process foundation.
- `packages/shared`: shared transport types.
- `packages/api-client`: generated OpenAPI types and typed client factory.
- `packages/ai-core`: reserved AI integration boundary.
- `packages/config`: shared TypeScript configuration.
- `prisma`: database schema and migrations.

Shared packages are built before starting development. After changing a shared package, restart `pnpm dev` to rebuild it.

Stop the processes with Ctrl+C and the database with `pnpm db:down`. The named database volume is preserved. The account module is intended for local development. Configure a production sender and complete provider and device verification before public deployment.

## Accounts and local email

Use the same origin consistently: http://127.0.0.1:3000. Cookies issued for this address are separate from localhost cookies. Next.js forwards account requests to the backend using API_INTERNAL_URL (default http://127.0.0.1:3001), read when the server runs. All account and auth responses use no-store. Development output is kept in .next-dev so a production build does not overwrite the running development app.

Environment setup generates a random BETTER_AUTH_SECRET when missing and preserves existing values. Never commit .env. AUTH_BASE_URL must match the public web origin; use HTTPS outside localhost. MAILPIT_URL defaults to http://127.0.0.1:8025. Docker Compose provides a local mailbox at that address. Messages stay local and are not delivered to real inboxes.

Pilot access requires an approved, verified email. After building the API, manage admission from the repository root:

```sh
pnpm pilot:access approve alex@example.test
pnpm pilot:access revoke alex@example.test
```

Use synthetic addresses in examples and automated tests. Approval does not verify the email. Revocation ends sessions and blocks protected requests. The approval list is private database data, never a public API response or repository file.

Google uses a Web application OAuth client. Configure the consent screen and test users in Google Auth Platform. For local development, the JavaScript origin is http://127.0.0.1:3000 and the exact redirect URI is http://127.0.0.1:3000/api/auth/callback/google. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET together in the private root .env, then restart the API. Keep downloaded client credentials outside the repository. Tests use controlled provider responses and require no real Google credentials. Facebook is intentionally disabled without an additional status caption.

Email signup requires verification before sign-in. Password reset links expire and can be used once; reset and password changes invalidate other sessions. Email changes require a fresh sign-in, prior approval of the new address, and confirmation of both addresses. Export, account linking and deletion require a recent sign-in. Deletion also requires confirmation by email. Existing accounts are never linked just because provider emails match. Use the current sign-in method first and connect Google from Security.

The manifest includes standalone mode, standard and maskable icons, and an Apple touch icon. The UI explains browser installation. Account features require a network connection; there is no service worker or offline cache containing private responses. Real iPhone/Android installation and Google sign-in from an installed app still need device acceptance tests; Chromium viewport tests do not replace them.
