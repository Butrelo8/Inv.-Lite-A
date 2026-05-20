import { z } from "zod";
import { storage } from "../../storage";

export function registerMaintenanceTools(server: any) {
  server.tool(
    "list_due_maintenance",
    "Lista mantenimientos vencidos o próximos",
    z.object({ overdueOnly: z.boolean().optional() }),
    async (input: any) => {
      const schedules = await storage.getDueMaintenanceSchedules({ overdue: input.overdueOnly });
      return { content: [{ type: "text", text: JSON.stringify({ schedules }) }] };
    },
  );
}
