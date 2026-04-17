export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function escapeRegex(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function replacePlaceholderText(xml: string, placeholderName: string, value: string): string {
  const pattern = new RegExp(escapeRegex(`{{${placeholderName}}}`), "g");
  return xml.replace(pattern, escapeXml(value));
}

function findParagraphRange(xml: string, marker: string): { start: number; end: number } | null {
  const markerIdx = xml.indexOf(marker);
  if (markerIdx < 0) return null;

  const openTag = "<w:p";
  let searchFrom = markerIdx;
  let openIdx = -1;
  while (searchFrom >= 0) {
    const candidate = xml.lastIndexOf(openTag, searchFrom);
    if (candidate < 0) return null;
    const next = xml.charAt(candidate + openTag.length);
    if (next === ">" || next === " " || next === "/") {
      openIdx = candidate;
      break;
    }
    searchFrom = candidate - 1;
  }
  if (openIdx < 0) return null;

  const closeTag = "</w:p>";
  const closeIdx = xml.indexOf(closeTag, markerIdx);
  if (closeIdx < 0) return null;
  return { start: openIdx, end: closeIdx + closeTag.length };
}

export function removeParagraphContaining(xml: string, marker: string): string {
  const range = findParagraphRange(xml, marker);
  if (!range) return xml;
  return xml.slice(0, range.start) + xml.slice(range.end);
}

export function replaceParagraphContainingWithXml(
  xml: string,
  marker: string,
  replacementXml: string,
): string {
  const range = findParagraphRange(xml, marker);
  if (!range) {
    throw new Error(`paragraph containing "${marker}" not found`);
  }
  return xml.slice(0, range.start) + replacementXml + xml.slice(range.end);
}
