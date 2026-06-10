import {
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
  integer,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { organizations } from "./organizations";
import { users } from "./auth";
import { playbooks } from "./playbooks";
import { inventories } from "./infrastructure";
import { executions } from "./executions";
import { executionStatusEnum } from "./enums";

export const workflows = pgTable("workflows", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  extraVars: jsonb("extra_vars").$type<Record<string, string>>().default({}).notNull(),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  index("workflows_organization_id_idx").on(t.organizationId),
]);

export const workflowSteps = pgTable("workflow_steps", {
  id: uuid("id").primaryKey().defaultRandom(),
  workflowId: uuid("workflow_id")
    .notNull()
    .references(() => workflows.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
  name: varchar("name", { length: 255 }),
  playbookId: uuid("playbook_id").references(() => playbooks.id, { onDelete: "set null" }),
  inventoryId: uuid("inventory_id").references(() => inventories.id, { onDelete: "set null" }),
  options: jsonb("options")
    .$type<{
      dryRun?: boolean;
      tags?: string[];
      limitHosts?: string;
      extraVars?: Record<string, string>;
      vaultPasswordId?: string;
      propagateVars?: boolean;
    }>()
    .default({}),
  onFailure: varchar("on_failure", { length: 20 }).default("stop").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("workflow_steps_workflow_id_idx").on(t.workflowId),
]);

export const workflowExecutions = pgTable("workflow_executions", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  workflowId: uuid("workflow_id").references(() => workflows.id, { onDelete: "set null" }),
  status: executionStatusEnum("status").default("pending").notNull(),
  startedAt: timestamp("started_at"),
  finishedAt: timestamp("finished_at"),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("workflow_executions_organization_id_idx").on(t.organizationId),
]);

export const workflowStepExecutions = pgTable("workflow_step_executions", {
  id: uuid("id").primaryKey().defaultRandom(),
  workflowExecutionId: uuid("workflow_execution_id")
    .notNull()
    .references(() => workflowExecutions.id, { onDelete: "cascade" }),
  workflowStepId: uuid("workflow_step_id").references(() => workflowSteps.id, {
    onDelete: "set null",
  }),
  executionId: uuid("execution_id").references(() => executions.id, { onDelete: "set null" }),
  position: integer("position").notNull(),
  stepName: varchar("step_name", { length: 255 }),
  status: executionStatusEnum("status").default("pending").notNull(),
  startedAt: timestamp("started_at"),
  finishedAt: timestamp("finished_at"),
}, (t) => [
  index("workflow_step_executions_workflow_execution_id_idx").on(t.workflowExecutionId),
]);

// ─── Relations ────────────────────────────────────────────────────────────────

export const workflowsRelations = relations(workflows, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [workflows.organizationId],
    references: [organizations.id],
  }),
  createdByUser: one(users, {
    fields: [workflows.createdBy],
    references: [users.id],
  }),
  steps: many(workflowSteps),
  executions: many(workflowExecutions),
}));

export const workflowStepsRelations = relations(workflowSteps, ({ one }) => ({
  workflow: one(workflows, {
    fields: [workflowSteps.workflowId],
    references: [workflows.id],
  }),
  playbook: one(playbooks, {
    fields: [workflowSteps.playbookId],
    references: [playbooks.id],
  }),
  inventory: one(inventories, {
    fields: [workflowSteps.inventoryId],
    references: [inventories.id],
  }),
}));

export const workflowExecutionsRelations = relations(workflowExecutions, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [workflowExecutions.organizationId],
    references: [organizations.id],
  }),
  workflow: one(workflows, {
    fields: [workflowExecutions.workflowId],
    references: [workflows.id],
  }),
  createdByUser: one(users, {
    fields: [workflowExecutions.createdBy],
    references: [users.id],
  }),
  stepExecutions: many(workflowStepExecutions),
}));

export const workflowStepExecutionsRelations = relations(workflowStepExecutions, ({ one }) => ({
  workflowExecution: one(workflowExecutions, {
    fields: [workflowStepExecutions.workflowExecutionId],
    references: [workflowExecutions.id],
  }),
  workflowStep: one(workflowSteps, {
    fields: [workflowStepExecutions.workflowStepId],
    references: [workflowSteps.id],
  }),
  execution: one(executions, {
    fields: [workflowStepExecutions.executionId],
    references: [executions.id],
  }),
}));
