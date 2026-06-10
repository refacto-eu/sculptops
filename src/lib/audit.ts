import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { auditLogs } from "@/lib/db/schema";

interface AuditParams {
  organizationId: string;
  userId: string;
  action: "created" | "updated" | "deleted" | "executed" | "tested" | "cancelled";
  resourceType: "server" | "playbook" | "inventory" | "ssh_key" | "execution" | "vault_password" | "api_token"
    | "member" | "invite" | "webhook" | "schedule" | "workflow" | "account";
  resourceId?: string;
  resourceName?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string | null;
}

/** Extract the best-effort client IP from a NextRequest. */
export function getClientIp(req: NextRequest): string | undefined {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    req.headers.get("x-real-ip") ||
    undefined
  );
}

export async function writeAuditLog(params: AuditParams) {
  try {
    await db.insert(auditLogs).values(params);
  } catch {
    // Never let audit logging break the main flow
  }
}
