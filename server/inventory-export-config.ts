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
  "site_id",
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
  if (header === "site_id") return "siteId";
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
  "Site",
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
  Site: "siteId",
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
  Site: 8,
};

export const INVENTORY_EXPORT_PDF_MAX_LEN_ADMIN: Record<string, number> = {
  ...INVENTORY_EXPORT_PDF_MAX_LEN_VIEWER,
  Notes: 40,
};

export const INVENTORY_EXPORT_PDF_COL_WIDTHS_VIEWER = [50, 160, 55, 36, 30, 44, 50, 58, 62, 44, 36] as const;
export const INVENTORY_EXPORT_PDF_COL_WIDTHS_ADMIN = [...INVENTORY_EXPORT_PDF_COL_WIDTHS_VIEWER, 80] as const;

export const INVENTORY_EXPORT_PDF_HEADERS_CHECKLIST = [
  "#",
  "Código",
  "Nombre",
  "Serial",
  "Categoría",
  "Cant.",
  "Condición",
  "Cond. Regreso",
  "Firma",
  "Notas",
] as const;

export const INVENTORY_EXPORT_PDF_KEY_MAP_CHECKLIST: Record<string, string> = {
  "#": "_rowIndex",
  "Código": "code",
  "Nombre": "name",
  "Serial": "serialNumber",
  "Categoría": "category",
  "Cant.": "units",
  "Condición": "condition",
  "Cond. Regreso": "",
  "Firma": "",
  "Notas": "",
};

export const INVENTORY_EXPORT_PDF_MAX_LEN_CHECKLIST: Record<string, number> = {
  "#": 4,
  "Código": 15,
  "Nombre": 70,
  "Serial": 25,
  "Categoría": 25,
  "Cant.": 5,
  "Condición": 15,
};

export const INVENTORY_EXPORT_PDF_COL_WIDTHS_CHECKLIST = [20, 50, 150, 60, 65, 28, 50, 55, 75, 60] as const;

export const INVENTORY_EXPORT_PDF_BLANK_COLS_CHECKLIST: ReadonlySet<string> = new Set([
  "Cond. Regreso",
  "Firma",
  "Notas",
]);
