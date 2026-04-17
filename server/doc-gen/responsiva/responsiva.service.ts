import fs from "node:fs/promises";
import JSZip from "jszip";
import { resolveStoredFilePath } from "../../path-utils";
import { formatSpanishLongDate } from "./date-es";
import {
  removeParagraphContaining,
  replaceParagraphContainingWithXml,
  replacePlaceholderText,
} from "./docx-xml";
import { buildPhotoTableXml } from "./photo-table";
import { embedAttachmentImages } from "./image-embedder";
import { ensureImageContentTypes, insertImageRelationships } from "./rels-xml";

export interface ResponsivaItem {
  code: string;
  name: string;
  serialNumber: string | null | undefined;
  responsible: string | null | undefined;
}

export interface ResponsivaAttachment {
  imageUrl: string;
}

export interface GenerateResponsivaInput {
  templatePath: string;
  uploadsDir: string;
  item: ResponsivaItem;
  attachments: readonly ResponsivaAttachment[];
  now?: Date;
}

export interface GeneratedResponsiva {
  buffer: Buffer;
  mimeType: string;
  suggestedFilename: string;
}

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const DOCUMENT_XML_PATH = "word/document.xml";
const DOCUMENT_RELS_PATH = "word/_rels/document.xml.rels";
const CONTENT_TYPES_PATH = "[Content_Types].xml";

function sanitizeFilenameSegment(raw: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^_+|_+$/g, "");
  return cleaned || "x";
}

export async function generateResponsivaDocx(
  input: GenerateResponsivaInput,
): Promise<GeneratedResponsiva> {
  const templateBytes = await fs.readFile(input.templatePath);
  const zip = await JSZip.loadAsync(templateBytes);

  const docEntry = zip.file(DOCUMENT_XML_PATH);
  if (!docEntry) throw new Error(`template missing ${DOCUMENT_XML_PATH}`);
  let docXml = await docEntry.async("string");

  const now = input.now ?? new Date();
  docXml = replacePlaceholderText(docXml, "FECHA", formatSpanishLongDate(now));
  docXml = replacePlaceholderText(docXml, "EQUIPO", input.item.name ?? "");
  docXml = replacePlaceholderText(docXml, "RESPONSABLE", input.item.responsible ?? "");

  const serial = (input.item.serialNumber ?? "").trim();
  if (serial.length === 0) {
    docXml = removeParagraphContaining(docXml, "{{SERIE}}");
  } else {
    docXml = replacePlaceholderText(docXml, "SERIE", serial);
  }

  const embedded = await embedAttachmentImages({
    zip,
    uploadsDir: input.uploadsDir,
    attachments: input.attachments,
    startingRId: 100,
    startingDocPrId: 1000,
    resolvePath: resolveStoredFilePath,
  });

  if (embedded.entries.length === 0) {
    docXml = removeParagraphContaining(docXml, "{{FOTOS}}");
  } else {
    const tableXml = buildPhotoTableXml(
      embedded.entries.map((e) => ({
        rId: e.rId,
        docPrId: e.docPrId,
        cxEmu: e.cxEmu,
        cyEmu: e.cyEmu,
      })),
    );
    docXml = replaceParagraphContainingWithXml(docXml, "{{FOTOS}}", tableXml);

    const relsEntry = zip.file(DOCUMENT_RELS_PATH);
    if (!relsEntry) throw new Error(`template missing ${DOCUMENT_RELS_PATH}`);
    const relsXml = await relsEntry.async("string");
    const nextRels = insertImageRelationships(
      relsXml,
      embedded.entries.map((e) => ({ rId: e.rId, target: e.mediaTarget })),
    );
    zip.file(DOCUMENT_RELS_PATH, nextRels);

    const ctEntry = zip.file(CONTENT_TYPES_PATH);
    if (!ctEntry) throw new Error(`template missing ${CONTENT_TYPES_PATH}`);
    const ctXml = await ctEntry.async("string");
    const nextCt = ensureImageContentTypes(
      ctXml,
      Array.from(embedded.extensions) as ("jpeg" | "png")[],
    );
    zip.file(CONTENT_TYPES_PATH, nextCt);
  }

  zip.file(DOCUMENT_XML_PATH, docXml);

  const buffer = (await zip.generateAsync({ type: "nodebuffer" })) as Buffer;

  const code = sanitizeFilenameSegment(input.item.code);
  const resp = sanitizeFilenameSegment(input.item.responsible ?? "responsable");
  return {
    buffer,
    mimeType: DOCX_MIME,
    suggestedFilename: `Responsiva_${code}_${resp}.docx`,
  };
}
