# Changelog

All notable changes to SculptOps are documented here.

---

## [0.1.0] — 2026-06-03

First public release.

### Core

- **Playbook editor** — Monaco-based editor with YAML syntax highlighting, full version history (v1 on first save), side-by-side diff viewer, one-click restore, inline title editing
- **Inventory manager** — Server groups, per-host and per-group variables, INI/YAML import and export
- **Execution engine** — Docker-based ephemeral containers, real-time log streaming via SSE, cancel, configurable timeout, memory/CPU/PID limits
- **Schedules** — Cron-based automation with next-run preview, optimistic lock for multi-instance safety
- **Workflows** — Multi-step pipelines with per-step failure handling (`stop` / `continue`) and variable propagation between steps
- **Webhooks** — HTTP trigger + Git push trigger (auto-sync playbook before run), branch filter, HMAC-SHA256 signature verification
- **SSH key management** — Ed25519 / RSA 4096 generation in-app, AES-256-GCM encryption at rest, fingerprint display
- **Ansible Vault** — Encrypted vault password storage, selectable at run time
- **Git sync** — Link playbooks to GitHub / GitLab / Bitbucket, sync on demand or on push

### Team & access

- **Multi-tenant** — Organization-scoped data isolation, all queries filter by `organization_id`
- **RBAC** — `admin`, `member`, `viewer` roles enforced at API layer
- **Invites** — One-time invite links with role assignment, server-side claim checks, send by email via SMTP
- **API tokens** — Personal access tokens (`at_` prefix), SHA-256 hashed, role-scoped, configurable expiry
- **Members** — Role management with admin warning modal, email privacy for non-admins
- **Audit log** — Full history of all create/update/delete/execute actions, filterable, CSV/JSON export

### Community library

- **Browse** — Full-text PostgreSQL search (`tsvector` + GIN index), category/tag/sort filters
- **Import** — One-click import into your workspace, community badge + author traceability on cards
- **Submit** — Server-side validation: YAML parse, Ansible structure check, 20-pattern security denylist, Checkov secrets scan (blocks hardcoded credentials)
- **Identity** — Verified GitHub/GitLab author via `sculptops.io/connect` (OAuth token, single use, encrypted at rest); personal account or public organization
- **Moderation** — Pending review queue, reports, verified badge (admin-manual), approved tab with verify/unverify

### Notifications

- **Webhooks** — Slack, Discord, generic HTTP; per-channel `onFailure` / `onSuccess` conditions
- **Email** — SMTP configuration with connection test, multiple recipients

### Dashboard

- KPI cards: executions, success rate, avg duration, active schedules (with delta vs previous period)
- Execution trend chart + top playbooks chart
- Selectable time window: 3d / 7d / 14d / 30d / 90d

### Security

- AES-256-GCM encryption for SSH keys, SMTP passwords, vault passwords, community tokens
- Outbound URL validation for webhook and Git-related HTTP calls, with private IPs and localhost blocked where enforced
- SSH stderr sanitized before returning errors to the client to reduce accidental credential exposure
- `SKIP_AUTH=true` blocked at startup in `NODE_ENV=production`
- Invite links are single-use and checked server-side before account creation
- Rate limiting on password change (5 attempts / 15 min)
- Tag validation: max 30 tags, max 256 chars each

### Infrastructure

- Docker Compose deployment (single command)
- Auto-migration on startup (`drizzle-orm/migrator`)
- Orphaned execution health check on startup — marks stuck `running`/`pending` as `failed`
- Graceful degradation when `COMMUNITY_API_URL` is not set

### Tests

- 103 unit tests (Vitest) — crypto, security, RBAC, ansible, api-token, utils
