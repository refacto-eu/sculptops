import {
  pgTable,
  text,
  timestamp,
  uuid,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { organizations } from "./organizations";
import { users } from "./auth";
import { playbooks } from "./playbooks";
import { inventories } from "./infrastructure";
import { executionStatusEnum, logLevelEnum } from "./enums";

export const executions = pgTable("executions", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  playbookId: uuid("playbook_id").references(() => playbooks.id, { onDelete: "set null" }),
  inventoryId: uuid("inventory_id").references(() => inventories.id, { onDelete: "set null" }),
  status: executionStatusEnum("status").default("pending").notNull(),
  options: jsonb("options")
    .$type<{
      dryRun?: boolean;
      tags?: string[];
      limitHosts?: string;
      extraVars?: Record<string, string>;
      vaultPasswordId?: string;
      targetServerId?: string;
    }>()
    .default({}),
  startedAt: timestamp("started_at"),
  finishedAt: timestamp("finished_at"),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  containerId: text("container_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("executions_organization_id_idx").on(t.organizationId),
  index("executions_status_idx").on(t.status),
]);

export const executionLogs = pgTable("execution_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  executionId: uuid("execution_id")
    .notNull()
    .references(() => executions.id, { onDelete: "cascade" }),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
  level: logLevelEnum("level").default("info").notNull(),
  message: text("message").notNull(),
  host: text("host"),
  task: text("task"),
}, (t) => [
  index("execution_logs_execution_id_idx").on(t.executionId),
]);

export const executionsRelations = relations(executions, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [executions.organizationId],
    references: [organizations.id],
  }),
  playbook: one(playbooks, {
    fields: [executions.playbookId],
    references: [playbooks.id],
  }),
  inventory: one(inventories, {
    fields: [executions.inventoryId],
    references: [inventories.id],
  }),
  createdByUser: one(users, {
    fields: [executions.createdBy],
    references: [users.id],
  }),
  logs: many(executionLogs),
}));

export const executionLogsRelations = relations(executionLogs, ({ one }) => ({
  execution: one(executions, {
    fields: [executionLogs.executionId],
    references: [executions.id],
  }),
}));
