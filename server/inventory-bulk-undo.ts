import type { PoolClient } from "pg";
import { storage } from "./storage";

export async function restoreDeleteUndoByToken(client: PoolClient, undoToken: string, userId: number | null) {
  const rowRes = await client.query(
    `select id, action_type, payload, expires_at, consumed_at
     from inventory_bulk_undo
     where token = $1
     for update`,
    [undoToken],
  );
  const row = rowRes.rows[0] as
    | {
        id: number;
        action_type: string;
        payload: { items: Record<string, unknown>[]; attachments: Record<string, unknown>[] };
        expires_at: Date;
        consumed_at: Date | null;
      }
    | undefined;
  if (!row) return { status: 404 as const, message: "Undo token not found" };
  if (row.consumed_at) return { status: 409 as const, message: "Undo token already consumed" };
  if (new Date(row.expires_at).getTime() < Date.now()) return { status: 410 as const, message: "Undo token expired" };
  if (row.action_type !== "bulk_delete" && row.action_type !== "single_delete") {
    return { status: 400 as const, message: "Unsupported undo token type" };
  }

  const payload = row.payload || { items: [], attachments: [] };
  for (const item of payload.items || []) {
    await client.query(
      `insert into inventory_items
        (id, code, name, serial_number, size, units, condition, purchase_date, responsible, useful_life, category, image_url, company_id, notes, created_at, updated_at)
       values
        ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       on conflict (id) do nothing`,
      [
        item.id, item.code, item.name, item.serial_number, item.size, item.units, item.condition, item.purchase_date,
        item.responsible, item.useful_life, item.category, item.image_url, item.company_id, item.notes, item.created_at, item.updated_at,
      ],
    );
  }
  for (const attachment of payload.attachments || []) {
    await client.query(
      `insert into inventory_attachments (id, item_id, image_url)
       values ($1, $2, $3)
       on conflict (id) do nothing`,
      [attachment.id, attachment.item_id, attachment.image_url],
    );
  }
  await client.query(`update inventory_bulk_undo set consumed_at = now() where id = $1`, [row.id]);

  for (const item of payload.items || []) {
    storage
      .addHistoryRecord({
        productId: Number(item.id),
        companyId: Number.isFinite(Number(item.company_id)) ? Number(item.company_id) : null,
        transactionType: "CREATE",
        quantity: Number(item.units ?? 0),
        userId,
        remarks: `${row.action_type === "bulk_delete" ? "UNDO_BULK_DELETE" : "UNDO_DELETE"}: ${String(item.name ?? `Item #${item.id}`)}`,
      })
      .catch(() => undefined);
  }

  return { status: 200 as const, restored: (payload.items || []).length };
}
