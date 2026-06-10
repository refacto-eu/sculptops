import { relations } from "drizzle-orm";
import { organizations, organizationMembers } from "./organizations";
import { sshKeys, servers, inventories, inventoryGroups, inventoryHosts } from "./infrastructure";
import { playbooks } from "./playbooks";
import { executions } from "./executions";
import { schedules } from "./schedules";
import { workflows, workflowExecutions } from "./workflows";
import { webhookTokens, inviteTokens, apiTokens } from "./tokens";
import { notificationSettings, auditLogs, vaultPasswords, smtpSettings } from "./settings";
import { users } from "./auth";
import { playbookVersions } from "./playbooks";
import { executionLogs } from "./executions";
import { workflowSteps, workflowStepExecutions } from "./workflows";

// organizationsRelations lives here because it references every domain table —
// keeping it here avoids circular imports between domain files.
export const organizationsRelations = relations(organizations, ({ one, many }) => ({
  members: many(organizationMembers),
  servers: many(servers),
  sshKeys: many(sshKeys),
  inventories: many(inventories),
  playbooks: many(playbooks),
  executions: many(executions),
  schedules: many(schedules),
  workflows: many(workflows),
  workflowExecutions: many(workflowExecutions),
  webhookTokens: many(webhookTokens),
  inviteTokens: many(inviteTokens),
  notificationSettings: many(notificationSettings),
  auditLogs: many(auditLogs),
  vaultPasswords: many(vaultPasswords),
  apiTokens: many(apiTokens),
  smtpSettings: one(smtpSettings, {
    fields: [organizations.id],
    references: [smtpSettings.organizationId],
  }),
}));

// ─── Domain re-exports ────────────────────────────────────────────────────────

export * from "./enums";
export * from "./auth";
export * from "./organizations";
export * from "./infrastructure";
export * from "./playbooks";
export * from "./executions";
export * from "./schedules";
export * from "./workflows";
export * from "./tokens";
export * from "./settings";

// ─── $inferSelect type exports ────────────────────────────────────────────────

export type User = typeof users.$inferSelect;
export type Organization = typeof organizations.$inferSelect;
export type OrganizationMember = typeof organizationMembers.$inferSelect;
export type SshKey = typeof sshKeys.$inferSelect;
export type Server = typeof servers.$inferSelect;
export type Inventory = typeof inventories.$inferSelect;
export type InventoryGroup = typeof inventoryGroups.$inferSelect;
export type InventoryHost = typeof inventoryHosts.$inferSelect;
export type Playbook = typeof playbooks.$inferSelect;
export type PlaybookVersion = typeof playbookVersions.$inferSelect;
export type Execution = typeof executions.$inferSelect;
export type ExecutionLog = typeof executionLogs.$inferSelect;
export type Schedule = typeof schedules.$inferSelect;
export type Workflow = typeof workflows.$inferSelect;
export type WorkflowStep = typeof workflowSteps.$inferSelect;
export type WorkflowExecution = typeof workflowExecutions.$inferSelect;
export type WorkflowStepExecution = typeof workflowStepExecutions.$inferSelect;
export type WebhookToken = typeof webhookTokens.$inferSelect;
export type NotificationSettings = typeof notificationSettings.$inferSelect;
export type InviteToken = typeof inviteTokens.$inferSelect;
export type VaultPassword = typeof vaultPasswords.$inferSelect;
export type ApiToken = typeof apiTokens.$inferSelect;
export type SmtpSettings = typeof smtpSettings.$inferSelect;
