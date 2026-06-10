export async function runWorkflow(workflowExecutionId: string) {
  const { db } = await import("@/lib/db");
  const {
    workflowExecutions, workflowStepExecutions, workflowSteps, workflows, executions,
  } = await import("@/lib/db/schema");
  const { and, eq, asc } = await import("drizzle-orm");
  const { runExecution } = await import("@/lib/run-execution");

  const wfExec = await db.query.workflowExecutions.findFirst({
    where: eq(workflowExecutions.id, workflowExecutionId),
  });
  if (!wfExec) return;

  const workflow = await db.query.workflows.findFirst({
    where: and(eq(workflows.id, wfExec.workflowId!), eq(workflows.organizationId, wfExec.organizationId)),
    with: { steps: { orderBy: [asc(workflowSteps.position)] } },
  });
  if (!workflow) {
    await db.update(workflowExecutions)
      .set({ status: "failed", finishedAt: new Date() })
      .where(eq(workflowExecutions.id, workflowExecutionId));
    return;
  }

  await db.update(workflowExecutions)
    .set({ status: "running", startedAt: new Date() })
    .where(eq(workflowExecutions.id, workflowExecutionId));

  // Vars accumulator: starts with workflow-level vars, grows as steps propagate
  let propagatedVars: Record<string, string> = { ...(workflow.extraVars ?? {}) };
  let overallStatus: "success" | "failed" = "success";

  for (const step of workflow.steps) {
    if (!step.playbookId || !step.inventoryId) continue;

    // Merge: workflow vars < propagated vars < step's own vars
    const mergedExtraVars: Record<string, string> = {
      ...propagatedVars,
      ...(step.options?.extraVars ?? {}),
    };

    const [execution] = await db.insert(executions).values({
      organizationId: wfExec.organizationId,
      playbookId: step.playbookId,
      inventoryId: step.inventoryId,
      options: {
        ...(step.options ?? {}),
        extraVars: mergedExtraVars,
      },
      status: "pending",
      createdBy: wfExec.createdBy,
    }).returning();

    const [stepExec] = await db.insert(workflowStepExecutions).values({
      workflowExecutionId,
      workflowStepId: step.id,
      executionId: execution.id,
      position: step.position,
      stepName: step.name ?? `Step ${step.position + 1}`,
      status: "pending",
    }).returning();

    await db.update(workflowStepExecutions)
      .set({ status: "running", startedAt: new Date() })
      .where(eq(workflowStepExecutions.id, stepExec.id));

    await runExecution(execution.id);

    const finalExec = await db.query.executions.findFirst({
      where: eq(executions.id, execution.id),
      columns: { status: true },
    });
    const stepStatus = (finalExec?.status ?? "failed") as "success" | "failed";

    await db.update(workflowStepExecutions)
      .set({ status: stepStatus, finishedAt: new Date() })
      .where(eq(workflowStepExecutions.id, stepExec.id));

    // If step propagates vars, merge its own extraVars into the accumulator
    if (step.options?.propagateVars && step.options?.extraVars) {
      propagatedVars = { ...propagatedVars, ...step.options.extraVars };
    }

    if (stepStatus === "failed") {
      overallStatus = "failed";
      if (step.onFailure === "stop") break;
    }
  }

  await db.update(workflowExecutions)
    .set({ status: overallStatus, finishedAt: new Date() })
    .where(eq(workflowExecutions.id, workflowExecutionId));

  try {
    const { sendExecutionNotification } = await import("@/lib/notify");
    await sendExecutionNotification({
      organizationId: wfExec.organizationId,
      executionId: workflowExecutionId,
      playbookName: workflow.name,
      playbookId: null,
      inventoryId: null,
      status: overallStatus,
    });
  } catch {
    // Notification failure must never crash the workflow pipeline
  }
}
