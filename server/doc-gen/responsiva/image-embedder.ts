import fs from "node:fs/promises";
import type JSZip from "jszip";
import { imageSize } from "image-size";
import { computeImageExtentEmu } from "./photo-table";

export type ImageExt = "jpeg" | "png";

export interface EmbeddedImageEntry {
  rId: string;
  docPrId: number;
  ext: ImageExt;
  mediaTarget: string;
  sourceImageUrl: string;
  cxEmu: number;
  cyEmu: number;
}

export interface EmbedAttachmentImagesInput {
  zip: JSZip;
  uploadsDir: string;
  attachments: readonly { imageUrl: string }[];
  startingRId: number;
  startingDocPrId: number;
  /** Resolve public `imageUrl` to an absolute filesystem path, or `null` if not allowed / not found. */
  resolvePath: (dir: string, url: string) => string | null;
}

export interface EmbedAttachmentImagesResult {
  entries: EmbeddedImageEntry[];
  extensions: Set<ImageExt>;
}

export function detectImageExtension(imageUrl: string): ImageExt | null {
  const dot = imageUrl.lastIndexOf(".");
  if (dot < 0) return null;
  const ext = imageUrl.slice(dot + 1).toLowerCase();
  if (ext === "jpg" || ext === "jpeg") return "jpeg";
  if (ext === "png") return "png";
  return null;
}

function extentFromImageBytes(bytes: Buffer): { cx: number; cy: number } {
  try {
    const dim = imageSize(new Uint8Array(bytes));
    const w = dim.width ?? 0;
    const h = dim.height ?? 0;
    return computeImageExtentEmu(w, h);
  } catch {
    return computeImageExtentEmu(0, 0);
  }
}

export async function embedAttachmentImages(
  input: EmbedAttachmentImagesInput,
): Promise<EmbedAttachmentImagesResult> {
  const entries: EmbeddedImageEntry[] = [];
  const extensions = new Set<ImageExt>();
  let nextRId = input.startingRId;
  let nextDocPr = input.startingDocPrId;
  let mediaIdx = 0;

  for (const att of input.attachments) {
    const ext = detectImageExtension(att.imageUrl);
    if (!ext) continue;

    const fsPath = input.resolvePath(input.uploadsDir, att.imageUrl);
    if (!fsPath) continue;

    let bytes: Buffer;
    try {
      bytes = await fs.readFile(fsPath);
    } catch {
      continue;
    }

    const { cx, cy } = extentFromImageBytes(bytes);

    const mediaTarget = `media/img_${mediaIdx}.${ext}`;
    input.zip.file(`word/${mediaTarget}`, bytes);

    entries.push({
      rId: `rId${nextRId}`,
      docPrId: nextDocPr,
      ext,
      mediaTarget,
      sourceImageUrl: att.imageUrl,
      cxEmu: cx,
      cyEmu: cy,
    });
    extensions.add(ext);

    nextRId += 1;
    nextDocPr += 1;
    mediaIdx += 1;
  }

  return { entries, extensions };
}
