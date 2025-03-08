import { pgTable, text, serial, integer, jsonb, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const deployments = pgTable("deployments", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  yamlConfig: text("yaml_config").notNull(),
  status: text("status").notNull().default("pending"),
  webuiUrl: text("webui_url"),
  error: text("error"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Schema for creating new deployments
export const insertDeploymentSchema = createInsertSchema(deployments).pick({
  name: true,
  yamlConfig: true,
});

// Define TypeScript types
export type InsertDeployment = z.infer<typeof insertDeploymentSchema>;
export type Deployment = typeof deployments.$inferSelect;