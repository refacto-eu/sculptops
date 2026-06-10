import {
  pgTable,
  timestamp,
  uuid,
  varchar,
  boolean,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { organizations } from "./organizations";
import { users } from "./auth";
import { playbooks } from "./playbooks";
import { inventories } from "./infrastructure";

export const schedules = pgTable("schedules", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  playbookId: uuid("playbook_id").references(() => playbooks.id, { onDelete: "set null" }),
  inventoryId: uuid("inventory_id").references(() => inventories.id, { onDelete: "set null" }),
  cronExpression: varchar("cron_expression", { length: 100 }).notNull(),
  options: jsonb("options")
    .$type<{
      dryRun?: boolean;
      tags?: string[];
      limitHosts?: string;
      extraVars?: Record<string, string>;
      vaultPasswordId?: string;
    }>()
    .default({}),
  enabled: boolean("enabled").default(true).notNull(),
  lastRunAt: timestamp("last_run_at"),
  nextRunAt: timestamp("next_run_at"),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  index("schedules_organization_id_idx").on(t.organizationId),
]);

export const schedulesRelations = relations(schedules, ({ one }) => ({
  organization: one(organizations, {
    fields: [schedules.organizationId],
    references: [organizations.id],
  }),
  playbook: one(playbooks, {
    fields: [schedules.playbookId],
    references: [playbooks.id],
  }),
  inventory: one(inventories, {
    fields: [schedules.inventoryId],
    references: [inventories.id],
  }),
  createdByUser: one(users, {
    fields: [schedules.createdBy],
    references: [users.id],
  }),
}));
