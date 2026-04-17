import HTMLtoDOCX from "html-to-docx";
import type { DocxRenderOptions } from "../types";

/**
 * Converts a full HTML document string to a DOCX buffer.
 */
export async function htmlToDocx(html: string, options: DocxRenderOptions = {}): Promise<Buffer> {
  const buf = await HTMLtoDOCX(html, null, {
    table: options.table,
    footer: options.footer ?? true,
    pageNumber: options.pageNumber ?? false,
  });
  if (Buffer.isBuffer(buf)) return buf;
  if (buf instanceof ArrayBuffer) return Buffer.from(buf);
  if (buf instanceof Uint8Array) return Buffer.from(buf);
  throw new Error("html-to-docx returned an unexpected type");
}
