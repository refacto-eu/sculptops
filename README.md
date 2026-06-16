<p align="center">
  <a href="https://sculptops.io">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="./public/brand/ScultOps_logo_dark_mode.png" />
      <source media="(prefers-color-scheme: light)" srcset="./public/brand/ScultOps_logo_light_mode.png" />
      <img src="./public/brand/ScultOps_logo_light_mode.png" width="220" alt="SculptOps" />
    </picture>
  </a>
</p>

<h2 align="center">Open-source Ansible automation platform</h2>

<p align="center">
  <a href="https://sculptops.io">Website</a>
  &middot;
  <a href="https://sculptops.io/docs">Documentation</a>
  &middot;
  <a href="./CHANGELOG.md">Changelog</a>
  &middot;
  <a href="./.github/SECURITY.md">Security</a>
  &middot;
  <a href="https://buymeacoffee.com/Refacto">Buy Me a Coffee</a>
</p>

<p align="center">
  <a href="https://github.com/refacto-eu/sculptops/actions/workflows/ci.yml?query=branch%3Amain">
    <img alt="CI" src="https://github.com/refacto-eu/sculptops/actions/workflows/ci.yml/badge.svg?branch=main" />
  </a>
  <a href="./LICENSE">
    <img alt="License: AGPL-3.0" src="https://img.shields.io/badge/license-AGPL--3.0-blue" />
  </a>
</p>

SculptOps is a self-hosted web interface for Ansible. It gives teams a central place to manage servers, inventories, SSH keys, playbooks, schedules, workflows, webhooks, API tokens, notifications, and real-time execution logs.

It is designed for teams that want Ansible automation with a clean UI, strong access control, and a deployment model they can run on their own infrastructure.

## Why SculptOps

Ansible is powerful, but day-to-day operations often end up split between terminals, private scripts, inventories, CI jobs, and shared credentials. SculptOps brings those workflows into one open-source application while keeping execution close to your infrastructure.

- Run playbooks from a browser without giving every user shell access
- Keep inventories, SSH keys, vault passwords, and playbooks in one place
- Give admins, operators, and viewers different levels of access
- Schedule recurring automation and trigger runs from external systems
- Follow execution history with live logs and audit trails
- Self-host the application and keep control of your data

## Installation

### Docker Compose

The fastest way to run SculptOps is with Docker Compose:

```bash
cp .env.example .env
docker compose up -d
```

Then open:

```text
http://localhost:3000
```

Before using the app seriously, update `.env` with real secrets and deployment URLs. See [Configuration](#configuration).

### Local Development

```bash
docker compose -f docker-compose.dev.yml up -d
npm install
cp .env.example .env
npm run db:push
npm run dev
```

Useful commands:

```bash
npm run lint
npm test
npm run build
npm run db:generate
npm run db:migrate
```

## Everything You Need

SculptOps focuses on the operational pieces teams usually need around Ansible.

| Area | What it does |
| --- | --- |
| Playbooks | Create, edit, version, import from Git, sync, and run playbooks. |
| Inventories | Build inventories from server groups, host variables, and group variables. |
| Executions | Run playbooks in Docker-based Ansible containers and stream logs in real time. |
| Schedules | Run playbooks on cron expressions and keep scheduled runs in history. |
| Workflows | Chain multiple playbooks into ordered automation flows. |
| Webhooks | Trigger playbooks from external systems or Git push events. |
| SSH keys | Store SSH private keys encrypted at rest and generate new keys in-app. |
| Vault | Store Ansible Vault passwords encrypted at rest. |
| Teams | Manage organizations, members, roles, invites, and API tokens. |
| Notifications | Send Slack, Discord, generic webhook, and SMTP email notifications. |
| Audit | Track important create, update, delete, and execute actions. |
| Community | Browse and import shared playbooks from the SculptOps community library. |

## Community Library

SculptOps can connect to the official community playbook library:

```text
https://api.sculptops.io
```

Set this URL in `COMMUNITY_API_URL` to enable community playbook browsing and importing. Leave it unset to run SculptOps without community features.

Self-hosted installations can also point `COMMUNITY_API_URL` to their own community API service.

## Configuration

SculptOps is configured with environment variables. Start from `.env.example`, then update the values for your environment.

### Required for Most Deployments

| Variable | Example | Description |
| --- | --- | --- |
| `DATABASE_URL` | `postgresql://postgres:change-me@localhost:5432/sculptops` | PostgreSQL connection string used by the application and migrations. |
| `AUTH_SECRET` | generated secret | Secret used by Auth.js to sign sessions and tokens. Use a long random value. |
| `AUTH_URL` | `https://sculptops.example.com` | Public URL of the app. In production, this must match the URL users access. |
| `ENCRYPTION_KEY` | 64 hex characters | AES-256-GCM key used to encrypt SSH private keys, SMTP passwords, vault passwords, and other sensitive values at rest. |
| `NEXT_PUBLIC_APP_URL` | `https://sculptops.example.com` | Public base URL used by the frontend and invite links. Usually the same value as `AUTH_URL`. |

Generate secrets:

```bash
openssl rand -base64 32
openssl rand -hex 32
```

Use the base64 value for `AUTH_SECRET` and the hex value for `ENCRYPTION_KEY`.

### Database Container

These values are used by the bundled PostgreSQL container in Docker Compose:

| Variable | Description |
| --- | --- |
| `POSTGRES_USER` | PostgreSQL user created by the container. |
| `POSTGRES_PASSWORD` | PostgreSQL password created by the container. Change this before production. |
| `POSTGRES_DB` | Database name created by the container. |

If you use an external PostgreSQL database, make sure `DATABASE_URL` points to it.

### Ansible Execution

| Variable | Default | Description |
| --- | --- | --- |
| `DOCKER_SOCKET` | `/var/run/docker.sock` | Docker socket used by SculptOps to start temporary Ansible execution containers. |
| `ANSIBLE_DOCKER_IMAGE` | `cytopia/ansible:latest` | Container image used to run `ansible-playbook`. |
| `ANSIBLE_DOCKER_NETWORK` | `bridge` | Docker network used by execution containers. Use `host` only when you explicitly need host-network access. |
| `ANSIBLE_EXECUTION_TIMEOUT` | `1800` | Maximum playbook execution time in seconds. |
| `ANSIBLE_MAX_MEMORY` | `2g` | Memory limit for each execution container. |
| `ANSIBLE_MAX_CPUS` | `4` | CPU limit for each execution container. |
| `ANSIBLE_MAX_PIDS` | `512` | Process limit for each execution container. |

### App Settings

| Variable | Default | Description |
| --- | --- | --- |
| `NEXT_PUBLIC_APP_NAME` | `SculptOps` | Display name used in the UI. |
| `ALLOW_PRIVATE_OUTBOUND` | `false` | Allows outbound webhook, SMTP, and Git-related requests to private IP ranges. Enable only for trusted internal deployments. |
| `ALLOW_INSECURE_OUTBOUND_HTTP` | `false` | Allows non-HTTPS outbound URLs. Not recommended for production. |

### Community

| Variable | Example | Description |
| --- | --- | --- |
| `COMMUNITY_API_URL` | `https://api.sculptops.io` | Enables the community library. Use the official URL, your own community API URL, or leave unset to disable the feature. |
| `COMMUNITY_SUBMIT_KEY` | optional secret | Optional key for trusted submissions when running your own community API. It must match the community API `SUBMIT_API_KEY`. |

## Stack

- Next.js and React
- TypeScript
- PostgreSQL and Drizzle ORM
- Auth.js
- Docker-based Ansible execution
- Tailwind CSS and HeroUI
- Vitest

## Contributing

Contributions are welcome. Please read the contribution guide before opening a pull request:

- [Contributing](./.github/CONTRIBUTING.md)
- [Security policy](./.github/SECURITY.md)
- [Contributor license agreement](./.github/CLA.md)

Before submitting a pull request, run:

```bash
npm run lint
npm test
npm run build
```

## License

SculptOps is licensed under the [GNU Affero General Public License v3.0](./LICENSE).

Copyright (C) 2026 Refacto
