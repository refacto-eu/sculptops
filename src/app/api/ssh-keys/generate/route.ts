import { NextRequest, NextResponse } from "next/server";
import { parseBody } from "@/lib/parse-body";
import { z } from "zod";
import { db } from "@/lib/db";
import { sshKeys } from "@/lib/db/schema";
import { getCurrentOrg, requireWrite } from "@/lib/get-org";
import { encrypt } from "@/lib/crypto";
import { writeAuditLog, getClientIp } from "@/lib/audit";
import { spawn } from "child_process";
import { mkdir, readFile, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";

const schema = z.object({
  name: z.string().min(1).max(255),
  type: z.enum(["ed25519", "rsa"]).default("ed25519"),
});

async function spawnAsync(cmd: string, args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args);
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (d: Buffer) => { stdout += d.toString(); });
    child.stderr?.on("data", (d: Buffer) => { stderr += d.toString(); });
    child.on("close", (code) => resolve({ code: code ?? 1, stdout, stderr }));
    child.on("error", () => resolve({ code: 1, stdout, stderr }));
  });
}

export async function POST(req: NextRequest) {
  const ctx = await getCurrentOrg();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const denied = requireWrite(ctx); if (denied) return denied;

  const [body, bodyErr] = await parseBody(req);
  if (bodyErr) return bodyErr;
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });

  const { name, type } = parsed.data;
  const tmpDir = join(tmpdir(), `keygen-${randomUUID()}`);
  await mkdir(tmpDir, { recursive: true });
  const keyPath = join(tmpDir, "id_key");

  try {
    const keygenArgs = [
      "-t", type,
      ...(type === "rsa" ? ["-b", "4096"] : []),
      "-C", `sculptops/${ctx.org.id.slice(0, 8)}`,
      "-f", keyPath,
      "-N", "",
      "-q",
    ];

    const { code, stderr } = await spawnAsync("ssh-keygen", keygenArgs);
    if (code !== 0) {
      console.error("[ssh-keygen]", stderr);
      return NextResponse.json({ error: "Key generation failed — ssh-keygen not available" }, { status: 500 });
    }

    const [privateKeyRaw, publicKey] = await Promise.all([
      readFile(keyPath, "utf8"),
      readFile(`${keyPath}.pub`, "utf8"),
    ]);

    // Get proper SHA256 fingerprint
    const { stdout: fpRaw } = await spawnAsync("ssh-keygen", ["-l", "-E", "sha256", "-f", `${keyPath}.pub`]);
    const fingerprint = fpRaw.trim().split(" ")[1] ?? null; // "SHA256:AAAA..."

    const { encryptedData, iv, authTag } = encrypt(privateKeyRaw);

    const [key] = await db
      .insert(sshKeys)
      .values({
        name,
        organizationId: ctx.org.id,
        encryptedPrivateKey: encryptedData,
        iv,
        authTag,
        publicKey: publicKey.trim(),
        fingerprint,
      })
      .returning({
        id: sshKeys.id,
        name: sshKeys.name,
        fingerprint: sshKeys.fingerprint,
        publicKey: sshKeys.publicKey,
        createdAt: sshKeys.createdAt,
      });

    await writeAuditLog({
      organizationId: ctx.org.id,
      userId: ctx.userId,
      action: "created",
      resourceType: "ssh_key",
      resourceId: key.id,
      resourceName: key.name,
      metadata: { generated: true, type },
      ipAddress: getClientIp(req),
    });

    return NextResponse.json(key, { status: 201 });
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}
