import { z } from 'zod';
import { insertInventoryItemSchema, inventoryItems, inventoryAssignments } from './schema';

export const errorSchemas = {
  validation: z.object({
    message: z.string(),
    field: z.string().optional(),
  }),
  notFound: z.object({
    message: z.string(),
  }),
  conflict: z.object({
    message: z.string(),
  }),
  internal: z.object({
    message: z.string(),
  }),
};

export const api = {
  inventory: {
    list: {
      method: 'GET' as const,
      path: '/api/inventory' as const,
      input: z.object({
        search: z.string().optional(),
        category: z.string().optional(),
        limit: z.number().optional(),
        offset: z.number().optional(),
      }).optional(),
      responses: {
        200: z.object({
          items: z.array(z.custom<typeof inventoryItems.$inferSelect>()),
          total: z.number(),
          activeAssignmentItemIds: z.array(z.number()),
        }),
      },
    },
    get: {
      method: 'GET' as const,
      path: '/api/inventory/:id' as const,
      responses: {
        200: z.custom<typeof inventoryItems.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/inventory' as const,
      input: insertInventoryItemSchema,
      responses: {
        201: z.custom<typeof inventoryItems.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    update: {
      method: 'PUT' as const,
      path: '/api/inventory/:id' as const,
      input: insertInventoryItemSchema.partial(),
      responses: {
        200: z.custom<typeof inventoryItems.$inferSelect>(),
        400: errorSchemas.validation,
        404: errorSchemas.notFound,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/inventory/:id' as const,
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
      },
    },
    assign: {
      method: 'POST' as const,
      path: '/api/inventory/:id/assign' as const,
      input: z.object({
        assignee: z.string().trim().min(1).max(120),
        condition: z.string().trim().max(80).optional(),
        notes: z.string().trim().max(2000).optional(),
        transfer: z.boolean().optional(),
      }),
      responses: {
        200: z.object({
          assignment: z.custom<typeof inventoryAssignments.$inferSelect>(),
          item: z.custom<typeof inventoryItems.$inferSelect>(),
        }),
        400: errorSchemas.validation,
        404: errorSchemas.notFound,
        409: errorSchemas.conflict,
      },
    },
    return: {
      method: 'POST' as const,
      path: '/api/inventory/:id/return' as const,
      input: z.object({
        condition: z.string().trim().max(80).optional(),
        notes: z.string().trim().max(2000).optional(),
      }),
      responses: {
        200: z.object({
          assignment: z.custom<typeof inventoryAssignments.$inferSelect>(),
          item: z.custom<typeof inventoryItems.$inferSelect>(),
        }),
        400: errorSchemas.validation,
        404: errorSchemas.notFound,
        409: errorSchemas.conflict,
      },
    },
    assignmentsList: {
      method: 'GET' as const,
      path: '/api/inventory/:id/assignments' as const,
      responses: {
        200: z.object({
          assignments: z.array(
            z.custom<
              typeof inventoryAssignments.$inferSelect & {
                assignedByUsername: string | null;
                returnedByUsername: string | null;
              }
            >(),
          ),
        }),
      },
    },
  },
};

export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}
