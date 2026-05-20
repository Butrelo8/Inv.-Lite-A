import { z } from "zod";
import { storage } from "../../storage";

export function registerNotesTools(server: any) {
  const mcpJson = (payload: unknown) => ({ content: [{ type: "text", text: JSON.stringify(payload) }] });
  server.tool(
    "list_notes",
    "Lista notas compartidas",
    z.object({ itemId: z.number().int().positive().optional() }),
    async (input: any) => {
      const notes = await storage.getSharedNotes(input.itemId);
      return mcpJson({ notes });
    },
  );

  server.tool(
    "create_note",
    "Crea nota compartida",
    z.object({ title: z.string().min(1), content: z.string().min(1), itemId: z.number().int().positive() }),
    async (input: any) => {
      const note = await storage.createSharedNote({ title: input.title, content: input.content, itemId: input.itemId, authorId: 1 });
      return mcpJson({ note });
    },
  );

  server.tool(
    "get_history",
    "Historial de inventario",
    z.object({ itemId: z.number().int().positive().optional(), limit: z.number().int().min(1).max(200).default(50) }),
    async (input: any) => {
      const entries = await storage.getHistory(input.limit, 0, input.itemId);
      return mcpJson({ entries });
    },
  );
}
