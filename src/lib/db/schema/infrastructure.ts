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
// ─── SSH Keys ─────────────────────────────────────────────────────────────────

export const sshKeys = pgTable("ssh_keys", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  publicKey: text("public_key"),
  encryptedPrivateKey: text("encrypted_private_key").notNull(),
  iv: text("iv").notNull(),
  authTag: text("auth_tag").notNull(),
  fingerprint: text("fingerprint"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  index("ssh_keys_organization_id_idx").on(t.organizationId),
]);

// ─── Servers ──────────────────────────────────────────────────────────────────

export const servers = pgTable("servers", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  host: varchar("host", { length: 255 }).notNull(),
  port: integer("port").default(22).notNull(),
  username: varchar("username", { length: 100 }).default("root").notNull(),
  description: text("description"),
  tags: text("tags").array().default([]),
  sshKeyId: uuid("ssh_key_id").references(() => sshKeys.id, { onDelete: "set null" }),
  lastConnectedAt: timestamp("last_connected_at"),
  status: varchar("status", { length: 50 }).default("unknown"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  index("servers_organization_id_idx").on(t.organizationId),
]);

// ─── Inventories ──────────────────────────────────────────────────────────────

export const inventories = pgTable("inventories", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  index("inventories_organization_id_idx").on(t.organizationId),
]);

export const inventoryGroups = pgTable("inventory_groups", {
  id: uuid("id").primaryKey().defaultRandom(),
  inventoryId: uuid("inventory_id")
    .notNull()
    .references(() => inventories.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  variables: jsonb("variables").$type<Record<string, string>>().default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("inventory_groups_inventory_id_idx").on(t.inventoryId),
]);

export const inventoryHosts = pgTable("inventory_hosts", {
  id: uuid("id").primaryKey().defaultRandom(),
  groupId: uuid("group_id")
    .notNull()
    .references(() => inventoryGroups.id, { onDelete: "cascade" }),
  serverId: uuid("server_id")
    .notNull()
    .references(() => servers.id, { onDelete: "cascade" }),
  variables: jsonb("variables").$type<Record<string, string>>().default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("inventory_hosts_group_id_idx").on(t.groupId),
]);

// ─── Relations ────────────────────────────────────────────────────────────────

export const sshKeysRelations = relations(sshKeys, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [sshKeys.organizationId],
    references: [organizations.id],
  }),
  servers: many(servers),
}));

export const serversRelations = relations(servers, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [servers.organizationId],
    references: [organizations.id],
  }),
  sshKey: one(sshKeys, {
    fields: [servers.sshKeyId],
    references: [sshKeys.id],
  }),
  inventoryHosts: many(inventoryHosts),
}));

export const inventoriesRelations = relations(inventories, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [inventories.organizationId],
    references: [organizations.id],
  }),
  groups: many(inventoryGroups),
}));

export const inventoryGroupsRelations = relations(inventoryGroups, ({ one, many }) => ({
  inventory: one(inventories, {
    fields: [inventoryGroups.inventoryId],
    references: [inventories.id],
  }),
  hosts: many(inventoryHosts),
}));

export const inventoryHostsRelations = relations(inventoryHosts, ({ one }) => ({
  group: one(inventoryGroups, {
    fields: [inventoryHosts.groupId],
    references: [inventoryGroups.id],
  }),
  server: one(servers, {
    fields: [inventoryHosts.serverId],
    references: [servers.id],
  }),
}));
