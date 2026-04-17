import { INVENTORY_EXPORT_HEADERS_VIEWER } from "./inventory-export-config";

export const TEMPLATE_PRESET_KEYS = ["generic", "field", "office"] as const;
export type InventoryTemplatePreset = (typeof TEMPLATE_PRESET_KEYS)[number];

export type ParsedTemplatePreset = { ok: true; value: InventoryTemplatePreset } | { ok: false; error: string };

export function parseTemplatePresetQuery(raw: unknown): ParsedTemplatePreset {
  if (raw == null || String(raw).trim() === "") return { ok: true, value: "generic" };
  const s = String(raw).trim().toLowerCase();
  if (s === "default" || s === "generic") return { ok: true, value: "generic" };
  if (s === "field" || s === "industrial") return { ok: true, value: "field" };
  if (s === "office" || s === "it") return { ok: true, value: "office" };
  return { ok: false, error: "Unknown preset; use generic, field, or office" };
}

const HEADER = INVENTORY_EXPORT_HEADERS_VIEWER.join(",");

const BODY: Record<InventoryTemplatePreset, string[]> = {
  generic: ["INV-001,Sample Item,SN-123,Medium,1,Good,2024-01-15,John Doe,5 years,Electronics,,"],
  field: [
    "FLD-001,Bomba centrifuga 5 HP,SN-BP-8844,Large,1,Good,2023-06-01,Equipo de trabajo,10 años,Fluidos,,",
    "FLD-002,Arnes seguridad clase III,,Standard,1,Good,2024-02-10,Sin asignar,5 años,EPP,,",
  ],
  office: [
    "IT-001,Laptop Dell Latitude 5420,DL-5420-12,Small,1,Good,2024-03-01,Maria Lopez,4 años,Computadoras,,",
    "IT-002,Monitor 27 LED,,Medium,2,Fair,2023-11-20,Equipo de trabajo,,Perifericos,,",
  ],
};

export function templateCsvForPreset(preset: InventoryTemplatePreset): string {
  return [HEADER, ...BODY[preset]].join("\r\n");
}

export function templateFilenameForPreset(preset: InventoryTemplatePreset, ext: "csv" | "xlsx"): string {
  const base = preset === "generic" ? "inventory-template" : `inventory-template-${preset}`;
  return `${base}.${ext}`;
}

export function templateDataRowsForPreset(preset: InventoryTemplatePreset): string[][] {
  const headers = [...INVENTORY_EXPORT_HEADERS_VIEWER] as string[];
  const rows = BODY[preset].map((line) => line.split(","));
  return [headers, ...rows];
}
