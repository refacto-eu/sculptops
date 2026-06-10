export async function register() {
  // Start the cron scheduler at server boot — independent of any route being visited,
  // so scheduled jobs fire even if nobody opens the dashboard after a restart.
  // Runs in both dev and prod (the production-only block below handles migrations).
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("@/lib/scheduler");
  }

  if (process.env.NODE_ENV !== "production") return;

  const { migrate } = await import("drizzle-orm/postgres-js/migrator");
  const { db }      = await import("@/lib/db");

  await migrate(db, { migrationsFolder: "drizzle" });

  // Mark any executions still in "running" or "pending" state as failed.
  // These are orphaned runs from a previous process that was killed mid-execution.
  // The Docker containers may still be running — they are left alive intentionally
  // so any in-progress Ansible work completes on the target hosts. Only the DB
  // status is corrected so the UI doesn't show them as stuck forever.
  const { executions, executionLogs, workflowExecutions, workflowStepExecutions } = await import("@/lib/db/schema");
  const { inArray, sql }              = await import("drizzle-orm");

  const orphaned = await db
    .update(executions)
    .set({
      status:     "failed",
      finishedAt: sql`now()`,
    })
    .where(inArray(executions.status, ["running", "pending"]))
    .returning({ id: executions.id });

  if (orphaned.length > 0) {
    await db.insert(executionLogs).values(
      orphaned.map(({ id }) => ({
        executionId: id,
        level:       "error" as const,
        message:     "Execution interrupted — server restarted while this run was in progress.",
      }))
    );
    console.warn(`[startup] marked ${orphaned.length} orphaned execution(s) as failed`);
  }

  // Same reconciliation for workflow executions and their steps — the workflow
  // wrapper isn't covered by the executions sweep above, so a restart mid-workflow
  // would otherwise leave it "running" forever in the UI.
  await db
    .update(workflowStepExecutions)
    .set({ status: "failed", finishedAt: sql`now()` })
    .where(inArray(workflowStepExecutions.status, ["running", "pending"]));

  const orphanedWorkflows = await db
    .update(workflowExecutions)
    .set({ status: "failed", finishedAt: sql`now()` })
    .where(inArray(workflowExecutions.status, ["running", "pending"]))
    .returning({ id: workflowExecutions.id });

  if (orphanedWorkflows.length > 0) {
    console.warn(`[startup] marked ${orphanedWorkflows.length} orphaned workflow execution(s) as failed`);
  }
}
