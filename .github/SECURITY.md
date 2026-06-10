# Security Policy

## Reporting a vulnerability

Please do not open a public GitHub issue for security vulnerabilities.

Report security concerns by email at: **contact@sculptops.io**

Include as much useful detail as you can:

- affected version or commit
- deployment context, if relevant
- steps to reproduce
- expected impact
- logs, screenshots, or proof of concept, with secrets removed

Do not include real private keys, passwords, API tokens, production credentials, or sensitive customer data in your report.

## Response

We aim to acknowledge security reports within **48 hours**.

For confirmed vulnerabilities, we will investigate, prioritize based on severity, and coordinate a fix or mitigation before public disclosure.

## Responsible disclosure

We ask that you give us reasonable time to investigate and address the issue before publishing details publicly.

Please avoid:

- accessing data that does not belong to you
- disrupting other users or services
- using destructive payloads
- attempting social engineering or phishing
- publicly disclosing an issue before we have had time to respond

## Scope

Reports are most useful when they affect SculptOps itself, including:

- authentication and session handling
- authorization and organization isolation
- API token handling
- encrypted credential storage
- playbook execution safety
- webhook and outbound request handling
- community submission handling

Out of scope:

- vulnerabilities in infrastructure you control, such as your Docker host, reverse proxy, or PostgreSQL deployment
- issues requiring physical access to a server or workstation
- social engineering
- denial of service without a clear security impact
- reports generated only by automated scanners without a reproducible impact

## Deployment security model

SculptOps executes Ansible playbooks in ephemeral Docker containers. This design has consequences you should understand before deploying:

### Docker socket access is root-equivalent

The `app` container mounts `/var/run/docker.sock` so it can spawn Ansible execution containers. Anything that fully compromises the app process can use that socket to control the Docker daemon, which is equivalent to root on the host.

Recommendations:

- run SculptOps on a dedicated host or VM, not shared with unrelated workloads
- do not expose the Docker daemon over TCP; keep the default Unix socket
- keep the app behind a reverse proxy and restrict who can reach it
- consider a socket proxy (such as tecnativa/docker-socket-proxy) that only allows the container operations SculptOps needs

### Shared `/tmp` between host and app container

Execution workspaces (playbook, inventory, decrypted SSH keys) are written under `/tmp` so sibling Ansible containers can mount them. Files are created with `0600` permissions and removed when the run ends, but on a multi-user host another account with the same UID mapping could read them while a run is in flight. Use a dedicated host, or point the workspace at a directory only the app user can read.

### SSH host key checking is disabled by default

Executions run with `ANSIBLE_HOST_KEY_CHECKING=False` so that first-contact automation works out of the box. This means a man-in-the-middle between SculptOps and a managed server would not be detected. For hardened environments, set `ANSIBLE_HOST_KEY_CHECKING=True` and provision known host keys in your playbook image or inventory.

### TLS and HSTS belong to the reverse proxy

The app sets baseline security headers itself (`X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`) but does not set `Strict-Transport-Security`, because it cannot know whether it is served over HTTPS. Terminate TLS at your reverse proxy and add HSTS there.

## Supported versions

Security fixes are provided for the latest stable release.
