import type { InventoryItem, InsertInventoryItem } from "@/hooks/use-inventory";

/**
 * Builds the request payload for duplicating an inventory item.
 * Matches the existing "row duplicate" behavior (empty `code` so the server can suggest/generate it,
 * and copies only scalar fields).
 */
export function inventoryItemToDuplicateCreateBody(item: InventoryItem): InsertInventoryItem {
  return {
    code: "",
    name: item.name ?? "",
    serialNumber: item.serialNumber ?? undefined,
    size: item.size ?? undefined,
    units: item.units ?? 0,
    condition: item.condition ?? undefined,
    purchaseDate: item.purchaseDate ?? undefined,
    responsible: item.responsible ?? undefined,
    usefulLife: item.usefulLife ?? undefined,
    category: item.category ?? undefined,
    // Intentionally do not copy notes/images/attachments.
  };
}

