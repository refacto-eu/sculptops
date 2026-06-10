import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { executions, executionLogs } from "@/lib/db/schema";
import { eq, and, gt, asc } from "drizzle-orm";
import { getCurrentOrg } from "@/lib/get-org";

// Server-Sent Events stream for real-time log tailing
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const ctx = await getCurrentOrg();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const execution = await db.query.executions.findFirst({
    where: and(eq(executions.id, id), eq(executions.organizationId, ctx.org.id)),
  });

  if (!execution) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      let lastId = "00000000-0000-0000-0000-000000000000";
      let done = false;

      const send = (data: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      // Poll for new logs every 500ms
      while (!done) {
        const logs = await db.query.executionLogs.findMany({
          where: and(
            eq(executionLogs.executionId, id),
            gt(executionLogs.id, lastId)
          ),
          orderBy: [asc(executionLogs.timestamp)],
          limit: 100,
        });

        for (const log of logs) {
          send({ type: "log", data: log });
          lastId = log.id;
        }

        // Check if execution is finished
        const current = await db.query.executions.findFirst({
          where: eq(executions.id, id),
          columns: { status: true },
        });

        if (
          current?.status === "success" ||
          current?.status === "failed" ||
          current?.status === "cancelled"
        ) {
          send({ type: "done", status: current.status });
          done = true;
          break;
        }

        await new Promise((resolve) => setTimeout(resolve, 500));
      }

      controller.close();
    },
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
