import {
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
  integer,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { organizations } from "./organizations";
import { users } from "./auth";

export const playbooks = pgTable("playbooks", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  content: text("content").notNull().default("---\n- hosts: all\n  tasks: []\n"),
  tags: text("tags").array().default([]),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  gitRepo: text("git_repo"),
  gitBranch: varchar("git_branch", { length: 100 }).default("main"),
  gitPath: text("git_path"),
  gitToken: text("git_token"),
  communitySourceId:     uuid("community_source_id"),
  communitySourceName:   varchar("community_source_name", { length: 255 }),
  communityAuthorName:   varchar("community_author_name", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  index("playbooks_organization_id_idx").on(t.organizationId),
]);

export const playbookVersions = pgTable("playbook_versions", {
  id: uuid("id").primaryKey().defaultRandom(),
  playbookId: uuid("playbook_id")
    .notNull()
    .references(() => playbooks.id, { onDelete: "cascade" }),
  version: integer("version").notNull(),
  content: text("content").notNull(),
  changedBy: uuid("changed_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("playbook_versions_playbook_id_idx").on(t.playbookId),
]);

export const playbooksRelations = relations(playbooks, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [playbooks.organizationId],
    references: [organizations.id],
  }),
  creator: one(users, {
    fields: [playbooks.createdBy],
    references: [users.id],
  }),
  versions: many(playbookVersions),
}));

export const playbookVersionsRelations = relations(playbookVersions, ({ one }) => ({
  playbook: one(playbooks, {
    fields: [playbookVersions.playbookId],
    references: [playbooks.id],
  }),
  changedByUser: one(users, {
    fields: [playbookVersions.changedBy],
    references: [users.id],
  }),
}));
