import {
  pgTable,
  timestamp,
  uuid,
  varchar,
  integer,
  jsonb,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { organizations } from "./organizations";
import { users } from "./auth";
import { playbooks } from "./playbooks";
import { inventories } from "./infrastructure";
import { memberRoleEnum } from "./enums";

// ─── Webhook Tokens ───────────────────────────────────────────────────────────

export const webhookTokens = pgTable("webhook_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  tokenHash: varchar("token", { length: 64 }).unique().notNull(),
  playbookId: uuid("playbook_id").references(() => playbooks.id, { onDelete: "set null" }),
  inventoryId: uuid("inventory_id").references(() => inventories.id, { onDelete: "set null" }),
  options: jsonb("options")
    .$type<{
      dryRun?: boolean;
      tags?: string[];
      limitHosts?: string;
      extraVars?: Record<string, string>;
    }>()
    .default({}),
  gitBranch: varchar("git_branch", { length: 255 }),
  lastTriggeredAt: timestamp("last_triggered_at"),
  triggerCount: integer("trigger_count").default(0).notNull(),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─── Invite Tokens ────────────────────────────────────────────────────────────

export const inviteTokens = pgTable("invite_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  tokenHash: varchar("token", { length: 64 }).unique().notNull(),
  role: memberRoleEnum("role").default("member").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  usedByUserId: uuid("used_by_user_id").references(() => users.id, { onDelete: "set null" }),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─── API Tokens ───────────────────────────────────────────────────────────────

export const apiTokens = pgTable("api_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  name: varchar("name", { length: 255 }).notNull(),
  tokenHash: varchar("token_hash", { length: 64 }).notNull().unique(),
  role: memberRoleEnum("role").default("member").notNull(),
  lastUsedAt: timestamp("last_used_at"),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─── Relations ────────────────────────────────────────────────────────────────

export const webhookTokensRelations = relations(webhookTokens, ({ one }) => ({
  organization: one(organizations, {
    fields: [webhookTokens.organizationId],
    references: [organizations.id],
  }),
  playbook: one(playbooks, {
    fields: [webhookTokens.playbookId],
    references: [playbooks.id],
  }),
  inventory: one(inventories, {
    fields: [webhookTokens.inventoryId],
    references: [inventories.id],
  }),
  createdByUser: one(users, {
    fields: [webhookTokens.createdBy],
    references: [users.id],
  }),
}));

export const inviteTokensRelations = relations(inviteTokens, ({ one }) => ({
  organization: one(organizations, {
    fields: [inviteTokens.organizationId],
    references: [organizations.id],
  }),
  createdByUser: one(users, {
    fields: [inviteTokens.createdBy],
    references: [users.id],
  }),
  usedByUser: one(users, {
    fields: [inviteTokens.usedByUserId],
    references: [users.id],
  }),
}));

export const apiTokensRelations = relations(apiTokens, ({ one }) => ({
  organization: one(organizations, {
    fields: [apiTokens.organizationId],
    references: [organizations.id],
  }),
  createdByUser: one(users, {
    fields: [apiTokens.createdBy],
    references: [users.id],
  }),
}));
