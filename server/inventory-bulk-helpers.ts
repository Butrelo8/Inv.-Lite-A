import { inventoryHistory } from "@shared/schema";
import { db } from "./db";

/** Same fields as `DatabaseStorage.addHistoryRecord` inserts (minus DB defaults). */
export type InventoryHistoryInsertRow = {
  productId: number | null;
  companyId?: number | null;
  transactionType: string;
  quantity: number;
  userId?: number | null;
  remarks?: string | null;
};

type InsertClient = Pick<typeof db, "insert">;

/** Single multi-row insert; no-op when `records` is empty. Use `tx` inside `db.transaction`. */
export async function insertInventoryHistoryBulk(client: InsertClient, records: InventoryHistoryInsertRow[]): Promise<void> {
  if (records.length === 0) return;
  await client.insert(inventoryHistory).values(records);
}
