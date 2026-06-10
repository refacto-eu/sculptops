import {
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
  boolean,
  jsonb,
  integer,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { organizations } from "./organizations";
import { users } from "./auth";

// ─── Notification Settings ────────────────────────────────────────────────────

export const notificationSettings = pgTable(
  "notification_settings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    channelType: varchar("channel_type", { length: 20 }).notNull(),
    webhookUrl: text("webhook_url"),
    onFailure: boolean("on_failure").default(true).notNull(),
    onSuccess: boolean("on_success").default(false).notNull(),
    enabled: boolean("enabled").default(false).notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    uniqOrgChannel: uniqueIndex("notification_settings_org_channel_idx").on(t.organizationId, t.channelType),
  })
);

// ─── Audit Logs ───────────────────────────────────────────────────────────────

export const auditLogs = pgTable("audit_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  action: varchar("action", { length: 50 }).notNull(),
  resourceType: varchar("resource_type", { length: 50 }).notNull(),
  resourceId: uuid("resource_id"),
  resourceName: varchar("resource_name", { length: 255 }),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
  ipAddress: varchar("ip_address", { length: 45 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─── Vault Passwords ──────────────────────────────────────────────────────────

export const vaultPasswords = pgTable("vault_passwords", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  encryptedPassword: text("encrypted_password").notNull(),
  iv: varchar("iv", { length: 64 }).notNull(),
  authTag: varchar("auth_tag", { length: 64 }).notNull(),
  provider: varchar("provider", { length: 50 }).default("local").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ─── SMTP Settings ───────────────────────────────────────────────────────────

export const smtpSettings = pgTable("smtp_settings", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .unique()
    .references(() => organizations.id, { onDelete: "cascade" }),
  host: varchar("host", { length: 255 }).notNull(),
  port: integer("port").default(587).notNull(),
  secure: boolean("secure").default(false).notNull(),
  username: varchar("username", { length: 255 }),
  encryptedPassword: text("encrypted_password"),
  iv: varchar("iv", { length: 64 }),
  authTag: varchar("auth_tag", { length: 64 }),
  fromAddress: varchar("from_address", { length: 255 }).notNull(),
  fromName: varchar("from_name", { length: 255 }).default("SculptOps").notNull(),
  recipients: text("recipients").array().default([]).notNull(),
  onFailure: boolean("on_failure").default(true).notNull(),
  onSuccess: boolean("on_success").default(false).notNull(),
  enabled: boolean("enabled").default(false).notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ─── Relations ────────────────────────────────────────────────────────────────

export const notificationSettingsRelations = relations(notificationSettings, ({ one }) => ({
  organization: one(organizations, {
    fields: [notificationSettings.organizationId],
    references: [organizations.id],
  }),
}));


export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  organization: one(organizations, {
    fields: [auditLogs.organizationId],
    references: [organizations.id],
  }),
  user: one(users, {
    fields: [auditLogs.userId],
    references: [users.id],
  }),
}));

export const vaultPasswordsRelations = relations(vaultPasswords, ({ one }) => ({
  organization: one(organizations, {
    fields: [vaultPasswords.organizationId],
    references: [organizations.id],
  }),
}));

export const smtpSettingsRelations = relations(smtpSettings, ({ one }) => ({
  organization: one(organizations, {
    fields: [smtpSettings.organizationId],
    references: [organizations.id],
  }),
}));
