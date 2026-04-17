export interface RelEntry {
  rId: string;
  target: string;
}

const IMAGE_REL_TYPE =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/image";

export function insertImageRelationships(relsXml: string, entries: readonly RelEntry[]): string {
  if (entries.length === 0) return relsXml;
  const closing = "</Relationships>";
  const idx = relsXml.lastIndexOf(closing);
  if (idx < 0) throw new Error("closing </Relationships> not found");
  const added = entries
    .map((e) => `<Relationship Id="${e.rId}" Type="${IMAGE_REL_TYPE}" Target="${e.target}"/>`)
    .join("");
  return relsXml.slice(0, idx) + added + relsXml.slice(idx);
}

export function ensureImageContentTypes(
  contentTypesXml: string,
  extensions: readonly ("jpeg" | "png")[],
): string {
  const closing = "</Types>";
  const idx = contentTypesXml.lastIndexOf(closing);
  if (idx < 0) throw new Error("closing </Types> not found");

  const toAdd: string[] = [];
  for (const ext of extensions) {
    const present = new RegExp(`Extension="${ext}"`).test(contentTypesXml);
    if (!present) {
      const mime = ext === "jpeg" ? "image/jpeg" : "image/png";
      toAdd.push(`<Default Extension="${ext}" ContentType="${mime}"/>`);
    }
  }
  if (toAdd.length === 0) return contentTypesXml;
  return contentTypesXml.slice(0, idx) + toAdd.join("") + contentTypesXml.slice(idx);
}
