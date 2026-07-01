import type { ExecutionContext } from "@/lib/ansible";

export async function runExecution(executionId: string) {
  const { db: database } = await import("@/lib/db");
  const { executions: executionsTable, executionLogs, playbooks, inventories, servers, sshKeys, vaultPasswords } = await import("@/lib/db/schema");
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
    const opts = execution.options as { vaultPasswordId?: string; targetServerId?: string } & typeof execution.options;

    const [playbook, inventory, directServer] = await Promise.all([
      database.query.playbooks.findFirst({
        where: and(eq(playbooks.id, execution.playbookId!), eq(playbooks.organizationId, execution.organizationId)),
      }),
      execution.inventoryId
        ? database.query.inventories.findFirst({
            where: and(eq(inventories.id, execution.inventoryId), eq(inventories.organizationId, execution.organizationId)),
            with: { groups: { with: { hosts: { with: { server: { with: { sshKey: true } } } } } } },
          })
        : Promise.resolve(null),
      opts.targetServerId
        ? database.query.servers.findFirst({
            where: and(eq(servers.id, opts.targetServerId), eq(servers.organizationId, execution.organizationId)),
            with: { sshKey: true },
          })
        : Promise.resolve(null),
    ]);

    if (!playbook || (!inventory && !directServer)) throw new Error("Playbook target not found");
    playbookName = playbook.name;

    const targetInventory = inventory ?? {
      id: `server-${directServer!.id}`,
      organizationId: execution.organizationId,
      name: directServer!.name,
      description: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      groups: [{
        name: "direct",
        variables: {},
        hosts: [{
          server: directServer!,
          variables: {},
        }],
      }],
    };

    for (const group of targetInventory.groups) {
      for (const host of group.hosts) {
        if (host.server.organizationId !== execution.organizationId) {
          throw new Error("Execution target contains a server outside this organization");
        }
      }
    }

    const uniqueKeyIds = new Set<string>();
    for (const group of targetInventory.groups) {
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
      { execution, playbook, inventory: targetInventory as ExecutionContext["inventory"], sshKeys: sshKeyList, vaultPassword: vaultPasswordStr },
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
