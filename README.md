# SculptOps

A modern, self-hostable web interface for Ansible. Manage servers, write and run playbooks, build inventories, schedule recurring jobs, chain playbooks into workflows, trigger runs via webhooks, receive Slack/Discord/email alerts, and watch real-time execution logs — all from a clean dark UI.

---

## Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router, Server Components) |
| Language | TypeScript (strict) |
| UI | HeroUI v2 + Tailwind CSS |
| Database | PostgreSQL via Drizzle ORM |
| Auth | Auth.js v5 (credentials + JWT sessions) |
| Encryption | AES-256-GCM (SSH private keys + SMTP password at rest) |
| Editor | Monaco Editor (YAML syntax highlighting + diff viewer) |
| Execution | Docker — ephemeral named containers (`cytopia/ansible`) |
| Real-time logs | Server-Sent Events (SSE) |
| Scheduler | node-cron (in-process, optimistic-lock deduplication) |
| Email | nodemailer (SMTP — notifications + invite emails) |
| Charts | Recharts |
| Tests | Vitest |
| Deployment | Docker Compose |

---

## Architecture

```
src/
├── app/
│   ├── (auth)/login              # Login page
│   ├── (auth)/register           # Register (standalone or invite flow)
│   ├── api/
│   │   ├── register/             # Account creation
│   │   ├── auth/password/        # Password change
│   │   ├── servers/              # + /[id]/test-connection
│   │   ├── ssh-keys/             # + /[id], /generate
│   │   ├── playbooks/            # + /[id]/versions, /import-git, /[id]/sync
│   │   ├── inventories/          # + /import, /[id]/export
│   │   ├── executions/           # + /[id]/logs (SSE), /[id]/cancel
│   │   ├── schedules/
│   │   ├── workflows/
│   │   ├── workflow-executions/
│   │   ├── webhooks/             # + /trigger/[token] (no auth)
│   │   ├── invites/              # + /[id], /info
│   │   ├── members/              # + /[userId]
│   │   ├── tokens/               # + /[id] — API tokens
│   │   ├── vault-passwords/      # + /[id]
│   │   ├── notifications/
│   │   │   ├── settings/         # Webhook notifications (Slack/Discord/generic)
│   │   │   ├── test/             # Send test webhook
│   │   │   └── smtp/             # + /test, /verify
│   │   └── audit-logs/
│   └── dashboard/
│       ├── (root)                # Dashboard with KPI cards + charts
│       ├── servers/
│       ├── ssh-keys/
│       ├── playbooks/            # + /[id] (editor + version history)
│       ├── inventories/
│       ├── executions/
│       ├── schedules/
│       ├── workflows/
│       ├── webhooks/
│       ├── vault/
│       ├── members/              # Team + invite links + send invite by email
│       ├── audit/
│       └── settings/             # Account, security, org, API tokens, notifications
├── components/
│   ├── ui/                       # Modal, Sidebar, Field, StatusBadge, FormError…
│   ├── servers/
│   ├── playbooks/                # Monaco editor + version history + diff viewer
│   ├── inventories/              # INI/YAML import & export
│   ├── executions/               # SSE log viewer + extra vars + cancel
│   ├── schedules/
│   ├── workflows/                # WorkflowStepEditor + WorkflowExecutionViewer
│   ├── webhooks/
│   ├── dashboard/                # ExecutionTrendChart, TopPlaybooksChart, PeriodSelector
│   └── settings/
│       ├── SecurityPanel         # Password change
│       ├── ApiTokensPanel        # Token creation/revocation with custom expiry
│       ├── MembersPanel          # Role management + member removal
│       ├── InvitesPanel          # Generate links + send invite by email
│       ├── NotificationsPanel    # Slack / Discord / generic webhook (independent)
│       ├── SmtpConfigPanel       # SMTP server config + connection test
│       └── SmtpNotificationsPanel# Email alerts — recipients, onFailure/onSuccess
└── lib/
    ├── db/
    │   └── schema/               # Domain-split: auth, organizations, playbooks,
    │                             #   executions, schedules, workflows, tokens,
    │                             #   infrastructure, settings, enums
    ├── session.ts                # Auth context
    ├── get-org.ts                # Bearer token resolution + requireWrite/requireAdmin
    ├── api-token.ts              # Token prefix validation + SHA-256 hashing
    ├── audit.ts                  # Audit log helper
    ├── ansible.ts                # Docker execution engine + inventory builder
    ├── run-execution.ts          # Execution runner + notification dispatch
    ├── run-workflow.ts           # Sequential workflow runner
    ├── sync-playbook.ts          # Git clone + playbook content update (used by push trigger)
    ├── notify.ts                 # sendExecutionNotification — webhooks + SMTP
    ├── scheduler.ts              # Cron scheduler (singleton + optimistic lock)
    └── crypto.ts                 # AES-256-GCM encrypt/decrypt
```

---

## Multi-tenancy & RBAC

Every resource is scoped to an `organization_id`. All API routes call `getCurrentOrg()` which validates the session **or** a Bearer API token and returns the org context before any DB query.

Three roles enforced **at the API layer** (not just the UI):

| Role | Permissions |
|---|---|
| `admin` | Full access — member management, invites, notification settings |
| `member` | Create, edit, delete, execute |
| `viewer` | Read-only — all mutations return 403 |

```typescript
const denied = requireWrite(ctx);  // returns 403 or null
if (denied) return denied;

const denied = requireAdmin(ctx);  // admin-only endpoints
if (denied) return denied;
```

---

## Execution flow

1. User clicks "Run Playbook" → `POST /api/executions`
2. The API creates an `execution` row (`status: pending`) and returns immediately
3. A background async function spins up a named Docker container:
   - Container name: `ansible-exec-{executionId}` (enables cancellation)
   - Writes playbook YAML, inventory INI, and SSH keys to a temp directory
   - Decrypts SSH private keys in-memory and writes them to the temp dir
   - Extra vars are written to a JSON file (`--extra-vars @/workspace/extra_vars.json`) to avoid shell injection
   - Runs `docker run --name=ansible-exec-{id} cytopia/ansible ansible-playbook ...`
   - Streams stdout/stderr into `execution_logs` rows
4. The frontend opens an SSE connection to `/api/executions/[id]/logs`
5. The SSE endpoint polls for new log rows every 500ms and pushes them to the client
6. Once the container exits, status is updated (`success` or `failed`)
7. `sendExecutionNotification()` dispatches alerts to all enabled channels in parallel: Slack webhook, Discord webhook, generic webhook, and/or SMTP email — each channel is independently configured and fires only if its condition (`onFailure` / `onSuccess`) matches

To **cancel** a running execution: `POST /api/executions/[id]/cancel` — marks the DB status as `cancelled` then runs `docker kill ansible-exec-{id}`.

An execution timeout (`ANSIBLE_EXECUTION_TIMEOUT`, default 1800s) kills the container automatically if it exceeds the limit.

---

## SSH key security

Private keys are encrypted with AES-256-GCM before being stored in PostgreSQL. The encryption key is a 64-character hex string in `ENCRYPTION_KEY` and never touches the database. Keys are decrypted in-memory only at execution time, written to `/tmp` inside the ephemeral container, then the container is discarded.

Keys are normalized on write: `\r` stripped, UTF-8 BOM removed, base64 body re-wrapped at 70 characters. This fixes silent corruption from Windows clipboard tools that inject CRLF into PEM keys.

Keys can be **generated in-app** (Ed25519 or RSA 4096 via `ssh-keygen`) — the public key is displayed with a one-click copy and a deploy command for `authorized_keys`.

---

## Capabilities

### Dashboard
KPI cards (total executions, success rate, avg duration, active schedules — each with a delta vs the previous period), an execution-trend chart and a top-playbooks chart, a selectable time window (3–90 days), a live infrastructure summary, and a recent-executions table.

### Server management
Add, edit, and delete remote servers (host, port, username, tags), attach SSH keys, and test SSH connectivity on demand (Reachable / Unreachable / Unknown). SSH error messages are sanitized before reaching the client.

### SSH key management
Store SSH key pairs with private keys encrypted at rest (AES-256-GCM), or generate them in-app (Ed25519 or RSA 4096). View the public key and fingerprint, copy in one click, and rotate keys without downtime.

### Playbook management
Create and edit playbooks in a Monaco editor (YAML, dark theme) with validation before save. Every save snapshots a new version with author and date — browse the full history, diff any two versions side-by-side, and restore in one click. Organize with tags, import from a GitHub/GitLab/Bitbucket repo (private repos via token) and re-sync on demand, or submit a playbook to the community library.

### Community library
Browse, search (PostgreSQL full-text), filter, and one-click import community playbooks into your workspace with source traceability. Submit your own for review — server-side validation runs a YAML/structure check, a security denylist, and a Checkov secrets scan, then it enters a moderation queue. Optionally connect GitHub or GitLab at `sculptops.io/connect` to publish under a verified handle. Includes votes, reports, and an admin-verified badge. Fully optional — disabled cleanly when `COMMUNITY_API_URL` is unset.

### Inventory management
Group servers into named inventory groups with host and group variables, multiple servers per group. Import from INI or YAML (max 1 MB) and export back to either format.

### Execution engine
Run any playbook against any inventory in one click, with options for dry run (`--check`), tag filtering, host limiting, and extra vars. Logs stream in real time over SSE; a run can be cancelled (kills the container) or re-run with the same options. History keeps status, duration, and full logs per run. The execution timeout is configurable (default 30 min).

### Schedules
Schedule any playbook + inventory with a cron expression, enable/disable without deleting, or trigger a **Run now** at any time. The next run time is shown in the UI, optimistic locking prevents duplicate runs across instances, and scheduled runs appear in history like any other execution.

### Workflows
Chain playbook steps into a sequential run, each with its own options and an `onFailure` policy (`stop` or `continue`); reorder steps freely and watch per-step status live. Define workflow-level `extraVars` as a shared base, and optionally propagate a step's vars downstream — merge priority is workflow vars < propagated vars < the step's own vars.

### Webhook triggers
Generate a secret token bound to a playbook + inventory and trigger runs via `POST /api/webhooks/trigger/{token}` (no auth), optionally overriding `dryRun`, `tags`, `limitHosts`, or `extraVars` in the JSON body.

The same URL doubles as a **Git push trigger**: point a GitHub or GitLab repository webhook (push event) at it and the playbook auto-syncs from its repo before running, so the run always uses the latest commit. An optional branch filter on the token restricts it to a given branch.

- **GitHub:** Settings → Webhooks → Add webhook · payload URL `https://your-app/api/webhooks/trigger/{token}` · content type `application/json` · just the push event · no secret
- **GitLab:** Settings → Webhooks · URL `https://your-app/api/webhooks/trigger/{token}` · check Push events · no secret

### Ansible Vault
Store named vault passwords (encrypted with AES-256-GCM) and select one at run time to decrypt vault-encrypted variables. Passwords are never exposed after creation.

### Notifications
Three independent webhook channels — **Slack** (formatted attachment), **Discord** (embed), and **Generic** (plain JSON) — each with its own URL, toggle, `onFailure`/`onSuccess` conditions, and a server-side test button. Email works the same way over SMTP: configure host/port/TLS/credentials (with a no-send connection test and the password encrypted at rest), then enable alerts to one or more recipients. All notification settings are admin-only.

### API tokens
Create personal access tokens for programmatic access (CI/CD, scripts) with a name, role, and expiry (or never). Tokens are prefixed `at_`, hashed with SHA-256 (raw value shown once), used as `Authorization: Bearer at_…`, track `lastUsedAt`, and can be revoked anytime.

### Members & access control
A dedicated Members page lists everyone with their role; admins see emails (hidden from non-admins), can promote/demote, and remove members. Invite teammates with a single-use link (chosen role, 7-day expiry, revocable) or send it by email over SMTP. All mutations are enforced at the API layer.

### Security
Login and registration are rate-limited (login 10/15 min per email and 30 per IP, registration 10/hour per IP, password change 5/15 min); passwords use bcrypt. Invite, API, and webhook tokens are stored as SHA-256 hashes (raw value shown once). Every response carries baseline security headers (`X-Frame-Options`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`), with TLS/HSTS handled by the reverse proxy. All mutations validate cross-tenant ownership (`organizationId`), outbound webhook/Git URLs are checked against private IPs and localhost, and SSH stderr is sanitized before reaching the client.

### Audit log
Every create/update/delete/execute is logged with actor, resource, timestamp, and enriched metadata (server IP/port, tags, dry-run flag…), filterable by resource type and exportable as CSV or JSON.

---

## Getting started

### Development (no Docker needed for the app itself)

```bash
# 1. Start PostgreSQL
docker compose -f docker-compose.dev.yml up -d

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env
# Edit .env — see Environment variables below

# 4. Push the schema
npx drizzle-kit push

# 5. Start the dev server
npm run dev
```

### Production

```bash
docker compose up -d
```

The production image runs `node scripts/migrate.mjs` on startup (using `drizzle-orm/postgres-js/migrator` — no drizzle-kit at runtime) then starts the Next.js server. Additionally, `src/instrumentation.ts` runs pending migrations when using `next start` directly. The container mounts `/var/run/docker.sock` so it can spawn Ansible execution containers.

### Seeding test users

> ⚠️ **Local development only — never run this in production.** It creates accounts with publicly-known passwords (listed below). Running it on a production database would expose an admin account to anyone.

```bash
npm run db:seed-test
```

Creates three accounts in a "Test Organization":

| Email | Password | Role |
|---|---|---|
| `adminTest@test.com` | `AdminTest1!` | admin |
| `memberTest@test.com` | `MemberTest1!` | member |
| `viewerTest@test.com` | `ViewerTest1!` | viewer |

---

## Tests

```bash
npm test               # run once
npm run test:watch     # watch mode
npm run test:coverage  # coverage report (v8)
```

**106 tests across 7 files** — all pure functions, no DB required:

| File | Covers |
|---|---|
| `crypto.test.ts` | AES-256-GCM encrypt/decrypt, tamper detection, `encryptToString`/`decryptFromString` |
| `ansible.test.ts` | SSH key normalization, inventory INI builder |
| `get-org.test.ts` | `requireWrite` / `requireAdmin` RBAC guards |
| `security.test.ts` | Path traversal prevention, SSRF / private IP blocking, `assertSafeHttpUrl` |
| `api-token.test.ts` | Token generation, hashing, `isApiToken`, ROLE_RANK escalation prevention |
| `rate-limit.test.ts` | Fixed-window limiter — limit enforcement, window reset, per-key isolation |
| `utils.test.ts` | `slugify`, `formatDate`, `getStatusColor` |

DB-touching code and Next.js internals are excluded from automated tests.

---

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `AUTH_SECRET` | Yes | Random secret for Auth.js JWT signing |
| `AUTH_URL` | Yes (prod) | Public base URL of the app for Auth.js login redirects (e.g. `https://app.example.com`). Must match the URL users actually reach, scheme included. |
| `ENCRYPTION_KEY` | Yes | 64-char hex string for AES-256-GCM encryption (SSH keys, SMTP password, vault) |
| `NEXT_PUBLIC_APP_URL` | Yes (prod) | Full base URL of the app — used in invite emails (e.g. `https://ansible.example.com`). In `docker-compose.yml` it defaults to `AUTH_URL`. |
| `NEXT_PUBLIC_APP_NAME` | No | Display name (default: `SculptOps`) |
| `ANSIBLE_DOCKER_IMAGE` | No | Ansible Docker image (default: `cytopia/ansible:latest`) |
| `ANSIBLE_EXECUTION_TIMEOUT` | No | Max execution duration in seconds (default: `1800`) |
| `ANSIBLE_MAX_MEMORY` | No | Docker memory limit per execution (default: `2g`) |
| `ANSIBLE_MAX_CPUS` | No | Docker CPU limit per execution (default: `4`) |
| `ANSIBLE_MAX_PIDS` | No | Docker PID limit per execution — prevents fork bombs (default: `512`) |
| `DOCKER_SOCKET` | No | Docker socket path (default: `/var/run/docker.sock`) |
| `ALLOW_PRIVATE_OUTBOUND` | No | Set to `true` to allow webhook/SMTP calls to private IPs. For trusted internal deployments only. |
| `ALLOW_INSECURE_OUTBOUND_HTTP` | No | Set to `true` to allow HTTP (non-HTTPS) webhook URLs. Not recommended. |
| `COMMUNITY_API_URL` | No | URL of the community-api service. Point at the official library `https://api.sculptops.io` to browse and contribute, or at your own community-api deployment. Leave unset to disable community features entirely. |
| `COMMUNITY_SUBMIT_KEY` | No | Optional. Self-hosted instances submit anonymously without it. Set it only if you run your own community-api and want this instance treated as trusted — it must then match that service's `SUBMIT_API_KEY`. |

Generate `ENCRYPTION_KEY`:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Generate `AUTH_SECRET`:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

---

## License

SculptOps is licensed under the [GNU Affero General Public License v3.0](./LICENSE) (AGPL-3.0).

Copyright © 2026 Refacto
