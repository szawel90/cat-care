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

- Web: <http://localhost:3000>
- API liveness: <http://127.0.0.1:3001/health/live>
- API readiness: <http://127.0.0.1:3001/health/ready>
- API documentation: <http://127.0.0.1:3001/docs>
- OpenAPI JSON: <http://127.0.0.1:3001/openapi.json>

Readiness returns 503 if PostgreSQL is unavailable or the vector extension has not been migrated. Liveness remains independent of the database.

The worker starts as an idle process with graceful shutdown. It does not claim jobs or call a model yet. Domain models and routes will be added with their corresponding features.

## Testing policy

Every new or changed feature must include appropriate automated tests in the same change, across the web, API, worker, shared packages, database and AI integrations. Every bug fix must include a regression test.

Test expected behavior, meaningful edge cases and failures. Include authorization and data isolation checks where applicable. Choose unit, integration or browser tests for the behavior being changed, and validate configuration, migrations and scripts with appropriate automated checks. Assertions should verify requirements and observable outcomes.

A feature or fix is complete when its tests and the relevant local and CI checks pass. Required checks must pass before merging into main. Use synthetic data and isolated services, with controlled AI responses in ordinary CI.

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

Integration tests require the migrated local database. Browser tests start the built web application; keep port 3000 free. Unit tests exercise the HTTP contract and failure handling without a database. Jest uses Node's VM module flag to load NestJS ESM dependencies in its isolated test environment; this flag is not used by the running applications.

Run `pnpm api:generate` after changing API DTOs or routes. Commit the OpenAPI document and generated client types together. Client applications depend on the API contract, not Prisma entities.

## GitHub Actions

The CI workflow runs on every branch push and pull request. Once the workflow is on the default branch, it can also be started manually from the Actions tab.

GitHub provides a fresh Ubuntu runner with a temporary PostgreSQL/pgvector service. CI installs the locked dependencies, validates migrations and the generated API contract, checks formatting and types, runs the API and database tests, builds the applications, and tests the web page with Chromium.

Check the repository's Actions tab for the result of each run and the failing step, if any. CI uses synthetic configuration and does not connect to the local development database.

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

Stop the processes with Ctrl+C and the database with `pnpm db:down`. The named database volume is preserved. This skeleton has no authentication or domain features and is intended for local development.
