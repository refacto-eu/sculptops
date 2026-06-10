import { pgEnum } from "drizzle-orm/pg-core";

export const memberRoleEnum = pgEnum("member_role", ["admin", "member", "viewer"]);
export const executionStatusEnum = pgEnum("execution_status", [
  "pending",
  "running",
  "success",
  "failed",
  "cancelled",
]);
export const logLevelEnum = pgEnum("log_level", ["info", "warning", "error", "debug"]);
