/**
 * Translates category names between database (English) and UI display (Spanish).
 * The database stores English; the UI displays Spanish.
 */

const EN_TO_ES: Record<string, string> = {
  Cameras: "Cámaras",
  Communication: "Comunicación",
  "Diving Equipment": "Equipo de Buceo",
  Electronics: "Electrónica",
  "Field Tools": "Herramientas de Campo",
  Lighting: "Iluminación",
  "Office Equipment": "Equipo de Oficina",
  "Safety Equipment": "Equipo de Seguridad",
  "Scientific Monitoring": "Monitoreo Científico",
  "Water Sampling": "Muestreo de Agua",
  Drones: "Drones",
  Furniture: "Muebles",
  Machinery: "Maquinaria",
  Vehicles: "Vehículos",
  Other: "Otro",
  "Office Supplies": "Suministros de Oficina",
  Uncategorized: "Sin categorizar",
};

/** Convert database category (English) to Spanish for UI display */
export function categoryToDisplay(dbCategory: string | null | undefined): string {
  if (!dbCategory?.trim()) return "Sin categorizar";
  const trimmed = dbCategory.trim();
  return EN_TO_ES[trimmed] ?? trimmed;
}

/** Condition (English) → Spanish for display */
const CONDITION_ES: Record<string, string> = {
  New: "Nuevo",
  Excellent: "Excelente",
  Good: "Bueno",
  Fair: "Regular",
  Poor: "Pobre",
  Damaged: "Dañado",
  Unknown: "Desconocido",
};

export function conditionToDisplay(condition: string | null | undefined): string {
  if (!condition?.trim()) return "Desconocido";
  return CONDITION_ES[condition.trim()] ?? condition.trim();
}
