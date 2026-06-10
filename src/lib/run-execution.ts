import type { ExecutionContext } from "@/lib/ansible";

export async function runExecution(executionId: string) {
  const { db: database } = await import("@/lib/db");
  const { executions: executionsTable, executionLogs, playbooks, inventories, sshKeys, vaultPasswords } = await import("@/lib/db/schema");
  const { sendExecutionNotification } = await import("@/lib/notify");
  const { eq, and, inArray } = await import("drizzle-orm");
  const { decrypt } = await import("@/lib/crypto");
  const { executePlaybook } = await import("@/lib/ansible");

  const execution = await database.query.executions.findFirst({
    where: eq(executionsTable.id, executionId),
  });
  if (!execution) return;
  if (execution.status === "cancelled") return;

  await database
    .update(executionsTable)
    .set({ status: "running", startedAt: new Date() })
    .where(eq(executionsTable.id, executionId));

  let finalStatus: "success" | "failed" = "failed";
  let playbookName = "Unknown";

  try {
    const [playbook, inventory] = await Promise.all([
      database.query.playbooks.findFirst({
        where: and(eq(playbooks.id, execution.playbookId!), eq(playbooks.organizationId, execution.organizationId)),
      }),
      database.query.inventories.findFirst({
        where: and(eq(inventories.id, execution.inventoryId!), eq(inventories.organizationId, execution.organizationId)),
        with: { groups: { with: { hosts: { with: { server: { with: { sshKey: true } } } } } } },
      }),
    ]);

    if (!playbook || !inventory) throw new Error("Playbook or inventory not found");
    playbookName = playbook.name;

    for (const group of inventory.groups) {
      for (const host of group.hosts) {
        if (host.server.organizationId !== execution.organizationId) {
          throw new Error("Inventory contains a server outside this organization");
        }
      }
    }

    const uniqueKeyIds = new Set<string>();
    for (const group of inventory.groups) {
      for (const host of group.hosts) {
        if (host.server.sshKeyId) uniqueKeyIds.add(host.server.sshKeyId);
      }
    }

    const sshKeyList = uniqueKeyIds.size > 0
      ? await database.query.sshKeys.findMany({
          where: and(
            inArray(sshKeys.id, [...uniqueKeyIds]),
            eq(sshKeys.organizationId, execution.organizationId),
          ),
        })
      : [];

    const opts = execution.options as { vaultPasswordId?: string } & typeof execution.options;
    let vaultPasswordStr: string | undefined;
    if (opts.vaultPasswordId) {
      const vaultPwd = await database.query.vaultPasswords.findFirst({
        where: and(
          eq(vaultPasswords.id, opts.vaultPasswordId),
          eq(vaultPasswords.organizationId, execution.organizationId),
        ),
      });
      if (vaultPwd) {
        vaultPasswordStr = decrypt(vaultPwd.encryptedPassword, vaultPwd.iv, vaultPwd.authTag);
      }
    }

    const result = await executePlaybook(
      { execution, playbook, inventory: inventory as ExecutionContext["inventory"], sshKeys: sshKeyList, vaultPassword: vaultPasswordStr },
      async (message, level = "info") => {
        await database.insert(executionLogs).values({
          executionId,
          message,
          level: level as "info" | "warning" | "error" | "debug",
        });
      }
    );

    finalStatus = result;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await database.insert(executionLogs).values({ executionId, message: `Fatal error: ${message}`, level: "error" });
  }

  // Check if cancelled before overwriting status
  const current = await database.query.executions.findFirst({
    where: eq(executionsTable.id, executionId),
    columns: { status: true },
  });

  if (current?.status !== "cancelled") {
    await database
      .update(executionsTable)
      .set({ status: finalStatus, finishedAt: new Date() })
      .where(eq(executionsTable.id, executionId));

    await sendExecutionNotification({
      organizationId: execution.organizationId,
      executionId,
      playbookName,
      playbookId: execution.playbookId ?? null,
      inventoryId: execution.inventoryId ?? null,
      status: finalStatus,
    });
  }
}
