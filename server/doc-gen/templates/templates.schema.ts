/**
 * API validation helpers for document templates.
 * Drizzle table lives in `@shared/schema` (`docTemplates`).
 */
import { createInsertSchema } from "drizzle-zod";
import { docTemplates, DOC_TEMPLATE_VARIABLE_TYPES } from "@shared/schema";
import { z } from "zod";

const docTemplateVariableSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  type: z.enum(DOC_TEMPLATE_VARIABLE_TYPES),
  required: z.boolean(),
  defaultValue: z.string().optional(),
});

const pageConfigSchema = z
  .object({
    format: z.enum(["A4", "Letter"]).optional(),
    landscape: z.boolean().optional(),
    margins: z
      .object({
        top: z.string(),
        right: z.string(),
        bottom: z.string(),
        left: z.string(),
      })
      .optional(),
    printBackground: z.boolean().optional(),
  })
  .optional()
  .nullable();

export const insertDocTemplateSchema = createInsertSchema(docTemplates)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    variables: z.array(docTemplateVariableSchema),
    pageConfig: pageConfigSchema,
  });

export const updateDocTemplateSchema = insertDocTemplateSchema.partial();

export type CreateDocTemplateInput = z.infer<typeof insertDocTemplateSchema>;
export type UpdateDocTemplateInput = z.infer<typeof updateDocTemplateSchema>;
