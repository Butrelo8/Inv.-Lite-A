export const INVENTORY_EXPORT_HEADERS_VIEWER = [
  "code",
  "name",
  "serial_number",
  "size",
  "units",
  "condition",
  "purchase_date",
  "responsible",
  "useful_life",
  "category",
  "company_id",
] as const;

export const INVENTORY_EXPORT_HEADERS_ADMIN = [
  ...INVENTORY_EXPORT_HEADERS_VIEWER,
  "notes",
] as const;

export function inventoryExportRowKey(header: string): string {
  // Map exported column names to the actual data keys returned by storage.
  // Anything not listed here maps 1:1.
  if (header === "serial_number") return "serialNumber";
  if (header === "purchase_date") return "purchaseDate";
  if (header === "useful_life") return "usefulLife";
  if (header === "company_id") return "companyId";
  return header;
}

export const INVENTORY_EXPORT_PDF_HEADERS_VIEWER = [
  "Code",
  "Name",
  "Serial",
  "Size",
  "Units",
  "Condition",
  "Date",
  "Responsible",
  "Category",
  "Company",
] as const;

export const INVENTORY_EXPORT_PDF_HEADERS_ADMIN = [
  ...INVENTORY_EXPORT_PDF_HEADERS_VIEWER,
  "Notes",
] as const;

export const INVENTORY_EXPORT_PDF_KEY_MAP_VIEWER: Record<string, string> = {
  Code: "code",
  Name: "name",
  Serial: "serialNumber",
  Size: "size",
  Units: "units",
  Condition: "condition",
  Date: "purchaseDate",
  Responsible: "responsible",
  Category: "category",
  Company: "companyId",
};

export const INVENTORY_EXPORT_PDF_KEY_MAP_ADMIN: Record<string, string> = {
  ...INVENTORY_EXPORT_PDF_KEY_MAP_VIEWER,
  Notes: "notes",
};

export const INVENTORY_EXPORT_PDF_MAX_LEN_VIEWER: Record<string, number> = {
  Name: 80,
  Code: 15,
  Serial: 25,
  Size: 15,
  Units: 5,
  Condition: 15,
  Date: 12,
  Responsible: 25,
  Category: 25,
  Company: 25,
};

export const INVENTORY_EXPORT_PDF_MAX_LEN_ADMIN: Record<string, number> = {
  ...INVENTORY_EXPORT_PDF_MAX_LEN_VIEWER,
  Notes: 40,
};

export const INVENTORY_EXPORT_PDF_COL_WIDTHS_VIEWER = [50, 180, 60, 38, 32, 48, 55, 65, 70, 48] as const;
export const INVENTORY_EXPORT_PDF_COL_WIDTHS_ADMIN = [...INVENTORY_EXPORT_PDF_COL_WIDTHS_VIEWER, 80] as const;

