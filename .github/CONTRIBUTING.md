# Contributing to SculptOps

Thank you for your interest in contributing. This document covers how to set up the project locally, the conventions we follow, and how to submit changes.

> **CLA required** — Before your first PR is merged, you must sign our [Contributor License Agreement](./CLA.md).
> <!-- TODO: Set up CLA Assistant (https://cla-assistant.io) to automate this. -->

---

## Getting started

### Prerequisites

- Node.js 20+
- Docker + Docker Compose
- Git

### Local setup

```bash
# 1. Clone the repo
git clone https://github.com/sculptops/sculptops.git
cd sculptops

# 2. Start PostgreSQL
docker compose -f docker-compose.dev.yml up -d

# 3. Install dependencies
npm install

# 4. Configure environment
cp .env.example .env
# Fill in: DATABASE_URL, AUTH_SECRET, ENCRYPTION_KEY
# Set SKIP_AUTH=true to bypass login during development

# 5. Push the schema
npx drizzle-kit push

# 6. Start the dev server
npm run dev
```

The app runs at http://localhost:3000.

### Running tests

```bash
npm test              # run all tests once (103 tests)
npm run test:watch    # watch mode
npm run test:coverage # coverage report
```

All tests must pass before submitting a PR. New `src/lib/` logic should include tests.

---

## Project structure

```
src/
├── app/
│   ├── api/          # API routes — one file per resource, org-scoped
│   └── dashboard/    # Next.js pages (server components)
├── components/       # UI components, co-located with their domain
├── lib/              # Pure utilities, DB schema, helpers
└── tests/            # Vitest tests (no DB required)
```

**Key rule**: every API route must call `getCurrentOrg()` and filter all DB queries by `organizationId`. Never expose data across organizations.

---

## Code conventions

### TypeScript
- Strict mode is enabled — no `any`, no `@ts-ignore` without a comment
- Prefer explicit return types on exported functions
- Zod schemas for all external input validation

### API routes
- Filter by `organizationId` on every query — verified by the security audit
- `requireWrite(ctx)` for mutations, `requireAdmin(ctx)` for admin-only endpoints
- Never return raw system errors to the client (SSH stderr, SMTP errors, git output)
- New env vars must be added to `.env.example` with a comment

### Security
- User-supplied URLs → `assertSafeHttpUrl()` before any outbound request
- User-supplied file paths → `safeJoinUnder()` before any filesystem access
- Credentials → `encryptToString()` before DB storage, never logged

### Commits

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add webhook branch filter
fix: prevent race condition on invite claim
docs: update environment variables reference
test: add SSRF tests for assertSafeHttpUrl
chore: bump Next.js to 16.3
security: sanitize git stderr before returning to client
```

---

## Submitting a pull request

1. Fork the repository and create a branch from `main`
2. Make your changes — keep PRs focused on a single concern
3. Run `npm test` — must pass
4. Run `npx tsc --noEmit` — must pass
5. Open a PR against `main` with a clear description

### PR checklist

- [ ] `npm test` passes
- [ ] `npx tsc --noEmit` passes
- [ ] No secrets or credentials in the diff
- [ ] API routes filter by `organizationId`
- [ ] New env vars added to `.env.example`
- [ ] CLA signed

---

## Reporting security vulnerabilities

See [SECURITY.md](./SECURITY.md). Do not open public issues for security bugs.

## License

By contributing, you agree that your contributions will be licensed under the [AGPL-3.0 License](../LICENSE) and that you have signed the [CLA](./CLA.md).
