/**
 * Keyword-based category suggestion for inventory items.
 * Matches item name (and optionally code) against keywords to suggest a category.
 */

/** English names stored in DB; use categoryToDisplay() for Spanish UI display */
export const SUGGESTED_CATEGORIES = [
  "Cameras",
  "Communication",
  "Diving Equipment",
  "Electronics",
  "Field Tools",
  "Lighting",
  "Office Equipment",
  "Safety Equipment",
  "Scientific Monitoring",
  "Water Sampling",
  "Drones",
  "Furniture",
  "Machinery",
  "Vehicles",
  "Other",
] as const;

// Keywords per category (lowercase, accents stripped for matching)
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  Drones: ["dron", "dji", "mini 4 pro", "control dji", "air 3s"],
  "Water Sampling": ["botella", "niskin", "water sample", "wildco", "beta"],
  "Office Equipment": ["escáner", "escaner", "scanner", "impresora", "printer", "proyector", "epson"],
  "Scientific Monitoring": [
    "hobo", "hanna", "onset", "luxómetro", "luxometro", "anemómetro", "anemometro",
    "ph", "orp", "tds", "ec/tds", "salinómetro", "salinometro", "turbidímetro", "turbidimetro",
    "refractómetro", "refractometro", "oxígeno disuelto", "oxigeno disuelto",
    "decibel", "sonómetro", "sonometro", "sonda", "profundidad", "depthtrax",
  ],
  Electronics: [
    "laptop", "computadora", "macbook", "hp ", "disco duro", "ssd", "gps", "garmin",
  ],
  Cameras: [
    "cámara", "camara", "gopro", "canon", "nikon", "olympus", "lente", "housing",
    "funda", "montura", "batería gopro", "memoria sd", "estabilizador", "adaptador montaje",
    "coolpix", "powershot", "eos ", "d3400",
  ],
  "Safety Equipment": ["casco", "ingeniero", "seguridad industrial"],
  Lighting: ["lámpara", "lampara", "spot", "husky", "lumen"],
  "Diving Equipment": [
    "buceo", "buzeo", "buzo", "chaleco buzeo", "chaleco buzo", "regulador",
    "pulpo", "varómetro", "varometro", "cressi", "brújula", "brujula",
  ],
  Communication: ["radio", "cobra", "marine hh"],
  "Field Tools": ["cinta métrica", "cinta metrica", "carrete", "truper"],
  Machinery: ["maquinaria"],
  Vehicles: ["vehículo", "vehiculo", "auto", "camión", "camion"],
  Furniture: ["silla", "mesa", "mueble"],
};

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Remove combining diacritical marks
    .replace(/\s+/g, " ");
}

export function suggestCategory(itemName: string, itemCode = ""): string | null {
  const combined = `${normalize(itemName)} ${normalize(itemCode)}`;
  if (!combined.trim()) return null;

  let bestMatch: { category: string; score: number } | null = null;

  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    for (const kw of keywords) {
      if (combined.includes(kw)) {
        const score = kw.length; // Longer matches = more specific
        if (!bestMatch || score > bestMatch.score) {
          bestMatch = { category, score };
        }
      }
    }
  }

  return bestMatch?.category ?? null;
}
