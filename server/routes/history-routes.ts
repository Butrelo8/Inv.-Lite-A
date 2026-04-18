import type { Express } from "express";
import { storage } from "../storage";
import { pool } from "../db";
import { getAuthUserId, requireAuth, requireRole } from "../route-middleware";
import { extractUndoTokenFromRemarks } from "../inventory-bulk-undo-helpers";
import { restoreDeleteUndoByToken } from "../inventory-bulk-undo";
import { parseHistoryPagination } from "../validation/query-params";

export function registerHistoryRoutes(app: Express): void {
  app.get("/api/history", requireAuth, requireRole("editor", "admin"), async (req, res) => {
    const { limit, offset } = parseHistoryPagination(req.query);
    const productId = req.query.productId ? parseInt(String(req.query.productId), 10) : undefined;
    const transactionType = (req.query.transactionType as string) || undefined;
    const userId = req.query.userId ? parseInt(String(req.query.userId), 10) : undefined;
    const dateFrom = (req.query.dateFrom as string) || undefined;
    const dateTo = (req.query.dateTo as string) || undefined;
    const search = (req.query.search as string) || undefined;
    const filters =
      transactionType || userId != null || dateFrom || dateTo || search
        ? { transactionType, userId, dateFrom, dateTo, search }
        : undefined;
    const [entries, total] = await Promise.all([
      storage.getHistory(limit, offset, productId, filters),
      storage.getHistoryCount(productId, filters),
    ]);
    const tokens = Array.from(
      new Set(
        entries
          .filter((entry) => entry.transactionType === "DELETE")
          .map((entry) => extractUndoTokenFromRemarks(entry.remarks))
          .filter((token): token is string => !!token),
      ),
    );
    const undoRows = tokens.length > 0
      ? await pool.query(
          `select token, action_type, expires_at, consumed_at
           from inventory_bulk_undo
           where token = any($1::text[])`,
          [tokens],
        )
      : { rows: [] };
    const undoByToken = new Map(
      undoRows.rows.map((r: { token: string; action_type: string; expires_at: Date; consumed_at: Date | null }) => [r.token, r]),
    );
    const now = Date.now();
    const enriched = entries.map((entry) => {
      const undoToken = extractUndoTokenFromRemarks(entry.remarks);
      const undo = undoToken ? undoByToken.get(undoToken) : undefined;
      const undoExpiresAt = undo?.expires_at ? new Date(undo.expires_at).toISOString() : null;
      const canRevert = !!(
        entry.transactionType === "DELETE"
        && undoToken
        && undo
        && !undo.consumed_at
        && new Date(undo.expires_at).getTime() >= now
      );
      return {
        ...entry,
        undoToken: undoToken ?? null,
        undoExpiresAt,
        canRevert,
        revertKind: undo?.action_type === "bulk_delete" ? "bulk_delete" : undo?.action_type === "single_delete" ? "single_delete" : null,
      };
    });
    res.json({ entries: enriched, total });
  });

  app.post("/api/history/:id/revert", requireAuth, requireRole("editor", "admin"), async (req, res) => {
    const historyId = Number(req.params.id);
    if (!Number.isFinite(historyId)) return res.status(400).json({ message: "Invalid history id" });
    const userId = getAuthUserId(req);
    const historyRes = await pool.query(
      `select id, transaction_type, remarks
       from inventory_history
       where id = $1`,
      [historyId],
    );
    const historyRow = historyRes.rows[0] as { id: number; transaction_type: string; remarks: string | null } | undefined;
    if (!historyRow) return res.status(404).json({ message: "History entry not found" });
    if (historyRow.transaction_type !== "DELETE") {
      return res.status(400).json({ message: "Only delete history entries can be reverted" });
    }
    const undoToken = extractUndoTokenFromRemarks(historyRow.remarks);
    if (!undoToken) return res.status(400).json({ message: "History entry is not revertible" });

    const client = await pool.connect();
    try {
      await client.query("begin");
      const result = await restoreDeleteUndoByToken(client, undoToken, userId);
      if (result.status !== 200) {
        await client.query("rollback");
        return res.status(result.status).json({ message: result.message });
      }
      await client.query("commit");
      return res.json({ restored: result.restored, undoToken });
    } catch (err) {
      await client.query("rollback").catch(() => undefined);
      return res.status(500).json({ message: err instanceof Error ? err.message : "Revert failed" });
    } finally {
      client.release();
    }
  });

  app.get("/api/history/users", requireAuth, requireRole("editor", "admin"), async (_req, res) => {
    const users = await storage.getHistoryUsers();
    res.json(users);
  });
}
