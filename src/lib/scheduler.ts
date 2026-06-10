import cron from "node-cron";
import { CronExpressionParser } from "cron-parser";

const g = global as typeof global & { schedulerStarted?: boolean };

function computeNextRun(cronExpression: string): Date | null {
  try {
    const interval = CronExpressionParser.parse(cronExpression);
    return interval.next().toDate();
  } catch {
    return null;
  }
}

async function tick() {
  const { db } = await import("@/lib/db");
  const { schedules, executions, executionLogs } = await import("@/lib/db/schema");
  const { eq, and, lte, isNull, or } = await import("drizzle-orm");

  const now = new Date();

  const due = await db.query.schedules.findMany({
    where: and(
      eq(schedules.enabled, true),
      or(isNull(schedules.nextRunAt), lte(schedules.nextRunAt, now))
    ),
  });

  for (const schedule of due) {
    try {
      const nextRunAt = computeNextRun(schedule.cronExpression);

      // Defensive: an unparseable cron would leave nextRunAt null and re-fire every tick.
      // Disable the schedule instead of spamming executions.
      if (!nextRunAt) {
        await db.update(schedules)
          .set({ enabled: false, updatedAt: now })
          .where(eq(schedules.id, schedule.id));
        console.error(`[scheduler] disabled schedule ${schedule.id}: unparseable cron "${schedule.cronExpression}"`);
        continue;
      }

      // Optimistic lock: only one instance wins by matching the exact current nextRunAt
      const claimed = await db
        .update(schedules)
        .set({ lastRunAt: now, nextRunAt, updatedAt: now })
        .where(and(
          eq(schedules.id, schedule.id),
          schedule.nextRunAt
            ? eq(schedules.nextRunAt, schedule.nextRunAt)
            : isNull(schedules.nextRunAt)
        ))
        .returning({ id: schedules.id });

      if (claimed.length === 0) continue; // Another instance already claimed this tick

      const [execution] = await db
        .insert(executions)
        .values({
          organizationId: schedule.organizationId,
          playbookId: schedule.playbookId,
          inventoryId: schedule.inventoryId,
          options: schedule.options ?? {},
          status: "pending",
          createdBy: schedule.createdBy,
        })
        .returning();

      // Run in background
      const { runExecution } = await import("@/lib/run-execution");
      runExecution(execution.id).catch(async (err: Error) => {
        await db.insert(executionLogs).values({
          executionId: execution.id,
          message: `Scheduler error: ${err.message}`,
          level: "error",
        });
      });
    } catch (err) {
      console.error(`[scheduler] failed to trigger schedule ${schedule.id}:`, err);
    }
  }
}

if (!g.schedulerStarted) {
  g.schedulerStarted = true;
  cron.schedule("* * * * *", () => {
    tick().catch(err => console.error("[scheduler] tick error:", err));
  });
  console.log("[scheduler] started");
}
