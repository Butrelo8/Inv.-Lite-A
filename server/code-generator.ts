/**
 * Auto-assigns item codes using the existing PREFIX + number pattern.
 * Reuses existing codes for the same type (non-cascading: MD00001, MD00001...).
 */

import { db } from "./db";
import { inventoryItems } from "@shared/schema";
import { like, asc } from "drizzle-orm";

/** Normalize text for keyword matching (lowercase, no accents) */
function normalize(t: string): string {
  return (t ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

/**
 * Keyword → prefix mapping. Order matters: more specific patterns first.
 * Based on existing inventory codes (MD, CB, CF, CP, etc.)
 */
const NAME_PREFIX_RULES: { keywords: string[]; prefix: string }[] = [
  { keywords: ["disco duro", "ssd", "hdd externo"], prefix: "DDE" },
  { keywords: ["hobo", "onset", "registrador datos"], prefix: "ML" },
  { keywords: ["refractómetro", "refractometro"], prefix: "RM" },
  { keywords: ["luxómetro", "luxometro"], prefix: "LM" },
  { keywords: ["turbidímetro", "turbidimetro"], prefix: "TM" },
  { keywords: ["sonda profundidad", "depthtrax"], prefix: "SP" },
  { keywords: ["oxígeno disuelto", "oxigeno disuelto"], prefix: "DD" },
  { keywords: ["decibel", "sonómetro", "sonometro"], prefix: "DD" },
  { keywords: ["medidor", "tds", "ec/tds", "ph", "salinómetro", "anemómetro", "luxometro"], prefix: "MD" },
  { keywords: ["dron", "dji", "control dji"], prefix: "DD" },
  { keywords: ["chaleco buzeo", "chaleco buzo"], prefix: "CB" },
  { keywords: ["computadora buzeo", "computadora buzo", "cressi"], prefix: "BC" },
  { keywords: ["varómetro", "varometro"], prefix: "VM" },
  { keywords: ["regulador"], prefix: "R" },
  { keywords: ["pulpo"], prefix: "PU" },
  { keywords: ["brújula", "brujula buceo"], prefix: "BB" },
  { keywords: ["radio", "cobra", "marine hh"], prefix: "RB" },
  { keywords: ["impresora", "epson l3", "epson modelo"], prefix: "IR" },
  { keywords: ["proyector", "epson epiq"], prefix: "PL" },
  { keywords: ["escáner", "escaner", "scanner"], prefix: "ME" },
  { keywords: ["computadora", "laptop", "macbook", "portatil hp"], prefix: "CP" },
  { keywords: ["gps", "garmin"], prefix: "GP" },
  { keywords: ["botella", "niskin", "wildco", "water sample"], prefix: "BH" },
  { keywords: ["cámara", "camara", "gopro", "canon", "nikon", "olympus", "coolpix", "powershot", "eos ", "d3400"], prefix: "CF" },
  { keywords: ["housing", "funda gopro", "funda cámara"], prefix: "FC" },
  { keywords: ["montura", "montura camara"], prefix: "MC" },
  { keywords: ["lente", "lente camara", "nikkor", "af-p"], prefix: "LC" },
  { keywords: ["memoria sd"], prefix: "SD" },
  { keywords: ["estabilizador"], prefix: "EC" },
  { keywords: ["batería gopro", "bateria gopro", "energione"], prefix: "BT" },
  { keywords: ["adaptador montaje", "adaptador de montaje"], prefix: "AM" },
  { keywords: ["cinta métrica", "cinta metrica", "carrete"], prefix: "CM" },
  { keywords: ["casco ingeniero", "casco de ingeniero"], prefix: "CC" },
  { keywords: ["chaleco seguridad", "seguridad industrial"], prefix: "CU" },
  { keywords: ["lámpara", "lampara", "spot", "husky", "lumen"], prefix: "EP" },
];

/** Category → default prefix when name doesn't match any rule (DB stores English) */
const CATEGORY_DEFAULT_PREFIX: Record<string, string> = {
  "Scientific Monitoring": "MD",
  Cameras: "CF",
  Electronics: "CP",
  "Diving Equipment": "CB",
  "Office Equipment": "IR",
  "Safety Equipment": "CC",
  Communication: "RB",
  "Field Tools": "CM",
  Lighting: "EP",
  Drones: "DD",
  "Water Sampling": "BH",
  Furniture: "FB",
  Machinery: "MA",
  Vehicles: "VH",
  "Office Supplies": "IR",
  Other: "OT",
};

/** Derive prefix from category and item name */
export function derivePrefix(category: string | null | undefined, name: string | null | undefined): string {
  const n = normalize(name ?? "");
  const c = (category ?? "").trim();

  for (const { keywords, prefix } of NAME_PREFIX_RULES) {
    for (const kw of keywords) {
      if (n.includes(kw)) return prefix;
    }
  }

  return CATEGORY_DEFAULT_PREFIX[c] ?? "OT";
}

/**
 * Suggest or assign a code: reuse lowest existing code for prefix, or create PREFIX00001.
 */
export async function suggestCode(
  category: string | null | undefined,
  name: string | null | undefined
): Promise<string> {
  const prefix = derivePrefix(category, name);

  const existing = await db
    .select({ code: inventoryItems.code })
    .from(inventoryItems)
    .where(like(inventoryItems.code, `${prefix}%`))
    .orderBy(asc(inventoryItems.code))
    .limit(1);

  if (existing.length) {
    return existing[0].code;
  }

  return `${prefix}00001`;
}
