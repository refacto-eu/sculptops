import { spawn } from "child_process";
import { writeFile, mkdir, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";
import type { Execution, Playbook, Inventory, SshKey, Server } from "@/lib/db/schema";
import { decrypt } from "@/lib/crypto";

export function normalizePrivateKey(raw: string): string {
  // Strip all CR, BOM, and non-printable chars outside normal ASCII range
  const clean = raw.replace(/\r/g, "").replace(/^﻿/, "").trim();
  const lines = clean.split("\n").map(l => l.trim()).filter(Boolean);

  const headerIdx = lines.findIndex(l => l.startsWith("-----BEGIN"));
  const footerIdx = lines.findIndex(l => l.startsWith("-----END"));
  if (headerIdx === -1 || footerIdx === -1) return clean + "\n";

  const header = lines[headerIdx];
  const footer = lines[footerIdx];
  // Rejoin base64 and re-wrap at exactly 70 chars (OpenSSH standard)
  const base64 = lines.slice(headerIdx + 1, footerIdx).join("");
  const wrapped = base64.match(/.{1,70}/g)?.join("\n") ?? base64;

  return `${header}\n${wrapped}\n${footer}\n`;
}

export interface ExecutionContext {
  execution: Execution;
  playbook: Playbook;
  inventory: Inventory & {
    groups: Array<{
      name: string;
      variables: Record<string, string>;
      hosts: Array<{
        server: Server;
        variables: Record<string, string>;
      }>;
    }>;
  };
  sshKeys: SshKey[];
  vaultPassword?: string;
}

export function buildInventoryContent(ctx: ExecutionContext): string {
  const lines: string[] = [];

  for (const group of ctx.inventory.groups) {
    lines.push(`[${group.name}]`);
    for (const host of group.hosts) {
      const { server, variables } = host;
      const hostVars: Record<string, string> = {
        ansible_port: String(server.port),
        ansible_user: server.username,
        ...variables,
      };
      if (server.sshKeyId) {
        hostVars["ansible_ssh_private_key_file"] = `/tmp/keys/${server.sshKeyId}.pem`;
      }
      const varStr = Object.entries(hostVars).map(([k, v]) => `${k}=${v}`).join(" ");
      lines.push(`${server.host} ${varStr}`);
    }
    lines.push("");

    if (Object.keys(group.variables).length > 0) {
      lines.push(`[${group.name}:vars]`);
      for (const [k, v] of Object.entries(group.variables)) {
        lines.push(`${k}=${v}`);
      }
      lines.push("");
    }
  }

  return lines.join("\n");
}

async function checkDockerAvailable(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const check = spawn("docker", ["info", "--format", "{{.ServerVersion}}"]);
    check.on("close", code => code === 0 ? resolve() : reject(new Error("Docker daemon is not running. Start Docker and try again.")));
    check.on("error", () => reject(new Error("Docker is not installed or not found in PATH.")));
  });
}

export async function executePlaybook(
  ctx: ExecutionContext,
  onLog: (message: string, level?: string) => void
): Promise<"success" | "failed"> {
  await checkDockerAvailable();

  const workDir = join(tmpdir(), `ansible-${randomUUID()}`);
  await mkdir(workDir, { recursive: true });

  try {
    const playbookPath = join(workDir, "playbook.yml");
    const inventoryPath = join(workDir, "inventory.ini");
    const sshKeyDir = join(workDir, "keys");
    await mkdir(sshKeyDir, { recursive: true });

    await writeFile(playbookPath, ctx.playbook.content, { mode: 0o600 });
    await writeFile(inventoryPath, buildInventoryContent(ctx), { mode: 0o600 });

    for (const key of ctx.sshKeys) {
      const keyPath = join(sshKeyDir, `${key.id}.pem`);
      await writeFile(keyPath, normalizePrivateKey(decrypt(key.encryptedPrivateKey, key.iv, key.authTag)), { mode: 0o600 });
    }

    const options = ctx.execution.options as {
      dryRun?: boolean;
      tags?: string[];
      limitHosts?: string;
      extraVars?: Record<string, string>;
    };

    const dockerImage = process.env.ANSIBLE_DOCKER_IMAGE || "cytopia/ansible:latest";

    // Write a static setup script — no user data inside, user args passed as $@ from spawn
    const setupScript = [
      "#!/bin/sh",
      "apk add --no-cache openssh-client -q 2>/dev/null",
      "mkdir -p /tmp/keys",
      "cp /workspace/keys/*.pem /tmp/keys/ 2>/dev/null && chmod 600 /tmp/keys/*.pem || true",
      'exec "$@"',
    ].join("\n");
    await writeFile(join(workDir, "run.sh"), setupScript, { mode: 0o755 });

    // User-provided values stay as separate argv elements — never shell-interpolated
    const ansibleArgs = [
      "ansible-playbook",
      "/workspace/playbook.yml",
      "-i", "/workspace/inventory.ini",
      "-v",
    ];
    if (options.dryRun) ansibleArgs.push("--check");
    if (options.tags?.length) ansibleArgs.push("--tags", options.tags.join(","));
    if (options.limitHosts) ansibleArgs.push("--limit", options.limitHosts);
    if (options.extraVars) {
      const filtered = Object.fromEntries(
        Object.entries(options.extraVars).filter(([k]) => k.trim())
      );
      if (Object.keys(filtered).length > 0) {
        // Write as JSON file — avoids all quoting/escaping issues with spaces and special chars
        const extraVarsPath = join(workDir, "extra_vars.json");
        await writeFile(extraVarsPath, JSON.stringify(filtered), { mode: 0o600 });
        ansibleArgs.push("--extra-vars", "@/workspace/extra_vars.json");
      }
    }
    if (ctx.vaultPassword) {
      const vaultPassPath = join(workDir, ".vault_pass");
      await writeFile(vaultPassPath, ctx.vaultPassword, { mode: 0o600 });
      ansibleArgs.push("--vault-password-file", "/workspace/.vault_pass");
    }

    const maxMemory = process.env.ANSIBLE_MAX_MEMORY ?? "2g";
    const maxCpus   = process.env.ANSIBLE_MAX_CPUS   ?? "4";
    const pidsLimit = process.env.ANSIBLE_MAX_PIDS   ?? "512";
    const dockerNetwork = process.env.ANSIBLE_DOCKER_NETWORK ?? "bridge";
    const hostKeyChecking = process.env.ANSIBLE_HOST_KEY_CHECKING ?? "False";

    const containerName = `ansible-exec-${ctx.execution.id}`;
    const dockerArgs = [
      "run",
      "--name", containerName,
      "--network", dockerNetwork,
      "--cap-drop=ALL",
      "--security-opt", "no-new-privileges",
      `--volume=${workDir}:/workspace:ro`,
      "--workdir=/workspace",
      `--memory=${maxMemory}`,
      `--memory-swap=${maxMemory}`,  // disables swap
      `--cpus=${maxCpus}`,
      `--pids-limit=${pidsLimit}`,
      "--env", `ANSIBLE_HOST_KEY_CHECKING=${hostKeyChecking}`,
      "--entrypoint", "/bin/sh",
      dockerImage,
      "/workspace/run.sh",
      ...ansibleArgs,
    ];

    onLog(`Starting execution: ansible-playbook ${ansibleArgs.slice(1).join(" ")}`, "info");

    const timeoutSec = parseInt(process.env.ANSIBLE_EXECUTION_TIMEOUT ?? "1800");
    const child = spawn("docker", dockerArgs);
    let exitCode = 0;

    child.stdout?.on("data", (data: Buffer) => {
      const lines = data.toString().split(/\r?\n/).filter(Boolean);
      for (const line of lines) {
        const level = line.includes("FAILED") || line.includes("ERROR") || line.includes("UNREACHABLE") ? "error" : "info";
        onLog(line, level);
      }
    });

    child.stderr?.on("data", (data: Buffer) => {
      const lines = data.toString().split(/\r?\n/).filter(Boolean);
      for (const line of lines) {
        onLog(line, "warning");
      }
    });

    exitCode = await new Promise<number>((resolve) => {
      const timer = setTimeout(() => {
        onLog(`Execution timed out after ${timeoutSec}s — killing container`, "error");
        spawn("docker", ["kill", containerName]).on("error", () => {});
        resolve(124);
      }, timeoutSec * 1000);

      child.on("close", (code) => {
        clearTimeout(timer);
        resolve(code ?? 1);
      });
    });

    // Clean up named container (ignore if already removed or never started)
    spawn("docker", ["rm", "-f", containerName]).on("error", () => {});

    if (exitCode === 124) return "failed";
    return exitCode === 0 ? "success" : "failed";
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
