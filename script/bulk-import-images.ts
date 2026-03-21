/**
 * Bulk import images from a folder to inventory items.
 * Matches images to items by filename containing item name AND serial number (when present).
 * Converts HEIC to JPEG before upload.
 *
 * Usage: npx tsx script/bulk-import-images.ts <folder-path> [base-url]
 * Example: npx tsx script/bulk-import-images.ts "Copia de Inventario"
 *          npx tsx script/bulk-import-images.ts "Copia de Inventario" http://localhost:5000
 *
 * Prerequisites: Server must be running. Images folder path can be absolute or relative to project root.
 */

import fs from "fs/promises";
import path from "path";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const convert = require("heic-convert");

const BASE_URL = process.argv[3] || "http://localhost:5000";
const IMAGE_EXT = [".heic", ".heif", ".jpg", ".jpeg", ".png", ".gif", ".webp"];

function normalizeForMatch(s: string): string {
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Remove accents
    .replace(/\s+/g, " ")
    .trim();
}

function filenameMatchesItem(
  filenameBase: string,
  itemName: string,
  itemSerial: string | null
): boolean {
  const normFile = normalizeForMatch(filenameBase);
  const normName = normalizeForMatch(itemName);
  const nameMatches = normFile.includes(normName);
  const serialMatches =
    itemSerial && itemSerial.trim()
      ? normFile.includes(normalizeForMatch(itemSerial))
      : false;
  return nameMatches || serialMatches;
}

async function getImageBuffer(
  filePath: string,
  ext: string
): Promise<{ buffer: Buffer; ext: string }> {
  const buf = await fs.readFile(filePath);
  if (ext.toLowerCase() === ".heic" || ext.toLowerCase() === ".heif") {
    const jpeg = await convert({
      buffer: buf,
      format: "JPEG",
      quality: 0.9,
    });
    return { buffer: Buffer.from(jpeg), ext: ".jpg" };
  }
  return { buffer: buf, ext };
}

async function uploadImage(
  baseUrl: string,
  itemId: number,
  buffer: Buffer,
  filename: string
): Promise<boolean> {
  const formData = new FormData();
  const blob = new Blob([buffer], { type: "image/jpeg" });
  formData.append("image", blob, filename);

  const res = await fetch(`${baseUrl}/api/inventory/${itemId}/image`, {
    method: "POST",
    body: formData,
  });
  return res.ok;
}

async function main() {
  const folderArg = process.argv[2];
  if (!folderArg) {
    console.error("Usage: npx tsx script/bulk-import-images.ts <folder-path> [base-url]");
    console.error('Example: npx tsx script/bulk-import-images.ts "Copia de Inventario"');
    process.exit(1);
  }

  const folderPath = path.isAbsolute(folderArg)
    ? folderArg
    : path.resolve(process.cwd(), folderArg);

  try {
    await fs.access(folderPath);
  } catch {
    console.error(`Folder not found: ${folderPath}`);
    process.exit(1);
  }

  console.log(`Folder: ${folderPath}`);
  console.log(`API: ${BASE_URL}`);
  console.log("");

  // Fetch all inventory items
  const res = await fetch(`${BASE_URL}/api/inventory`);
  if (!res.ok) {
    console.error("Failed to fetch inventory. Is the server running?");
    process.exit(1);
  }
  const items: { id: number; name: string; serialNumber: string | null }[] = await res.json();
  console.log(`Found ${items.length} inventory items`);

  // List all image files
  const files = await fs.readdir(folderPath);
  const imageFiles = files.filter((f) => {
    const ext = path.extname(f).toLowerCase();
    return IMAGE_EXT.includes(ext);
  });
  console.log(`Found ${imageFiles.length} image files\n`);

  const uploaded: { itemId: number; name: string; file: string }[] = [];
  const skipped: { itemId: number; name: string; reason: string }[] = [];
  const noMatch: string[] = [];
  const usedFiles = new Set<string>();

  for (const item of items) {
    const matches: { file: string; base: string; ext: string }[] = [];
    for (const file of imageFiles) {
      if (usedFiles.has(file)) continue;
      const ext = path.extname(file);
      const base = path.basename(file, ext);
      if (filenameMatchesItem(base, item.name, item.serialNumber)) {
        matches.push({ file, base, ext });
      }
    }

    if (matches.length === 0) {
      skipped.push({ itemId: item.id, name: item.name, reason: "No matching image" });
      continue;
    }

    // Prefer main photo first (without " 2", " 3" suffix), then others
    matches.sort((a, b) => {
      const aHasNum = /\s+\d+$/.test(a.base);
      const bHasNum = /\s+\d+$/.test(b.base);
      if (aHasNum && !bHasNum) return 1;
      if (!aHasNum && bHasNum) return -1;
      return a.base.length - b.base.length;
    });

    let anyUploaded = false;
    for (const chosen of matches) {
      try {
        const fullPath = path.join(folderPath, chosen.file);
        const { buffer, ext } = await getImageBuffer(fullPath, chosen.ext);
        const outName = `import-${item.id}-${matches.indexOf(chosen)}-${Date.now()}${ext}`;
        const ok = await uploadImage(BASE_URL, item.id, buffer, outName);
        if (ok) {
          uploaded.push({ itemId: item.id, name: item.name, file: chosen.file });
          usedFiles.add(chosen.file);
          anyUploaded = true;
        }
      } catch (err) {
        if (!anyUploaded) {
          skipped.push({
            itemId: item.id,
            name: item.name,
            reason: err instanceof Error ? err.message : "Error",
          });
        }
      }
    }
  }

  for (const file of imageFiles) {
    if (!usedFiles.has(file)) noMatch.push(file);
  }

  console.log("--- Results ---");
  console.log(`Uploaded: ${uploaded.length}`);
  uploaded.forEach((u) => console.log(`  ✓ Item ${u.itemId} (${u.name}) <- ${u.file}`));
  console.log(`\nSkipped (no match or error): ${skipped.length}`);
  skipped.slice(0, 20).forEach((s) => console.log(`  - Item ${s.itemId}: ${s.reason}`));
  if (skipped.length > 20) console.log(`  ... and ${skipped.length - 20} more`);
  console.log(`\nImages not matched to any item: ${noMatch.length}`);
  noMatch.slice(0, 15).forEach((f) => console.log(`  ? ${f}`));
  if (noMatch.length > 15) console.log(`  ... and ${noMatch.length - 15} more`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
