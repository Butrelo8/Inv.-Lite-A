/**
 * Convert HEIC/HEIF images to JPG format.
 * Handles files in the given folder (and optionally subfolders).
 *
 * Usage: npx tsx script/convert-heic-to-jpg.ts <folder-path> [--output <output-folder>]
 *
 * Examples:
 *   npx tsx script/convert-heic-to-jpg.ts "Copia de Inventario"
 *   npx tsx script/convert-heic-to-jpg.ts "Copia de Inventario" --output "Converted"
 */

import fs from "fs/promises";
import path from "path";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const convert = require("heic-convert");

const HEIC_EXT = [".heic", ".heif", ".HEIC", ".HEIF"];

function isHeic(filename: string): boolean {
  const ext = path.extname(filename);
  return HEIC_EXT.includes(ext);
}

async function convertFile(
  inputPath: string,
  outputPath: string,
  format: "JPEG" | "PNG" = "JPEG"
): Promise<void> {
  const buf = await fs.readFile(inputPath);
  const converted = await convert({
    buffer: buf,
    format,
    quality: 0.92,
  });
  await fs.writeFile(outputPath, Buffer.from(converted));
}

async function main() {
  const args = process.argv.slice(2);
  const folderArg = args[0];

  if (!folderArg) {
    console.error("Usage: npx tsx script/convert-heic-to-jpg.ts <folder-path> [--output <output-folder>]");
    console.error('Example: npx tsx script/convert-heic-to-jpg.ts "Copia de Inventario"');
    process.exit(1);
  }

  let outputFolder: string | null = null;
  const idx = args.indexOf("--output");
  if (idx !== -1 && args[idx + 1]) {
    outputFolder = args[idx + 1];
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

  const targetDir = outputFolder
    ? path.isAbsolute(outputFolder)
      ? outputFolder
      : path.resolve(folderPath, outputFolder)
    : folderPath;

  if (targetDir !== folderPath) {
    await fs.mkdir(targetDir, { recursive: true });
  }

  const files = await fs.readdir(folderPath);
  const heicFiles = files.filter(isHeic);

  if (heicFiles.length === 0) {
    console.log("No HEIC files found in the folder.");
    return;
  }

  console.log(`Found ${heicFiles.length} HEIC file(s). Converting to JPG...\n`);

  let ok = 0;
  let fail = 0;

  for (const file of heicFiles) {
    const inputPath = path.join(folderPath, file);
    const baseName = path.basename(file, path.extname(file));
    const outputPath = path.join(targetDir, `${baseName}.jpg`);
    try {
      await convertFile(inputPath, outputPath);
      console.log(`  ✓ ${file} -> ${baseName}.jpg`);
      ok++;
    } catch (err) {
      console.error(`  ✗ ${file}: ${err instanceof Error ? err.message : String(err)}`);
      fail++;
    }
  }

  console.log(`\nDone. Converted: ${ok}. Failed: ${fail}.`);
  if (targetDir !== folderPath) {
    console.log(`Output folder: ${targetDir}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
