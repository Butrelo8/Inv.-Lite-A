export interface PhotoEntry {
  rId: string;
  docPrId: number;
  /** Drawing extent EMU (horizontal). From `computeImageExtentEmu` + `image-size` in the embedder. */
  cxEmu: number;
  /** Drawing extent EMU (vertical). */
  cyEmu: number;
}

/**
 * Fit natural pixel dimensions into a max EMU rectangle; preserves aspect ratio.
 * If dimensions are missing or invalid, returns the full max box (legacy behavior).
 */
export function computeImageExtentEmu(
  pixelWidth: number,
  pixelHeight: number,
  maxCx = MAX_PHOTO_CX_EMU,
  maxCy = MAX_PHOTO_CY_EMU,
): { cx: number; cy: number } {
  if (
    !Number.isFinite(pixelWidth) ||
    !Number.isFinite(pixelHeight) ||
    pixelWidth <= 0 ||
    pixelHeight <= 0
  ) {
    return { cx: maxCx, cy: maxCy };
  }
  const ratio = pixelWidth / pixelHeight;
  let cx = maxCx;
  let cy = Math.round(maxCx / ratio);
  if (cy > maxCy) {
    cy = maxCy;
    cx = Math.round(maxCy * ratio);
  }
  return { cx, cy };
}

const COLS_PER_ROW = 3;
const TABLE_WIDTH_DXA = 9360;
const CELL_WIDTH_DXA = 3120;
const DXA_TO_EMU = 635;
const CELL_INNER_PADDING_DXA = 120;
const CELL_IMAGE_MAX_WIDTH_DXA = CELL_WIDTH_DXA - CELL_INNER_PADDING_DXA * 2;
const CELL_IMAGE_MAX_HEIGHT_DXA = 2520;

/**
 * Cap drawing size to the actual table-cell box.
 * `CELL_WIDTH_DXA` (3120) ~= 1_981_200 EMU, so old 2_800_000 overflowed and got clipped.
 */
export const MAX_PHOTO_CX_EMU = CELL_IMAGE_MAX_WIDTH_DXA * DXA_TO_EMU;
export const MAX_PHOTO_CY_EMU = CELL_IMAGE_MAX_HEIGHT_DXA * DXA_TO_EMU;

const TABLE_OPEN =
  "<w:tbl>" +
  "<w:tblPr>" +
  `<w:tblW w:w="${TABLE_WIDTH_DXA}" w:type="dxa"/>` +
  "<w:tblBorders>" +
  '<w:top w:val="nil"/>' +
  '<w:left w:val="nil"/>' +
  '<w:bottom w:val="nil"/>' +
  '<w:right w:val="nil"/>' +
  '<w:insideH w:val="nil"/>' +
  '<w:insideV w:val="nil"/>' +
  "</w:tblBorders>" +
  '<w:tblLayout w:type="fixed"/>' +
  "</w:tblPr>" +
  "<w:tblGrid>" +
  `<w:gridCol w:w="${CELL_WIDTH_DXA}"/>`.repeat(COLS_PER_ROW) +
  "</w:tblGrid>";

const TABLE_CLOSE = "</w:tbl>";

const CELL_BORDERS =
  "<w:tcBorders>" +
  '<w:top w:val="nil"/>' +
  '<w:left w:val="nil"/>' +
  '<w:bottom w:val="nil"/>' +
  '<w:right w:val="nil"/>' +
  "</w:tcBorders>";

function imageDrawingXml(entry: PhotoEntry): string {
  const { cxEmu, cyEmu } = entry;
  return (
    "<w:drawing>" +
    '<wp:inline distT="0" distB="0" distL="0" distR="0" ' +
    'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">' +
    `<wp:extent cx="${cxEmu}" cy="${cyEmu}"/>` +
    '<wp:effectExtent l="0" t="0" r="0" b="0"/>' +
    `<wp:docPr id="${entry.docPrId}" name="Picture ${entry.docPrId}"/>` +
    "<wp:cNvGraphicFramePr/>" +
    '<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">' +
    '<a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">' +
    '<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">' +
    "<pic:nvPicPr>" +
    `<pic:cNvPr id="${entry.docPrId}" name="Picture ${entry.docPrId}"/>` +
    "<pic:cNvPicPr/>" +
    "</pic:nvPicPr>" +
    "<pic:blipFill>" +
    `<a:blip xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:embed="${entry.rId}"/>` +
    "<a:srcRect/>" +
    "<a:stretch><a:fillRect/></a:stretch>" +
    "</pic:blipFill>" +
    "<pic:spPr>" +
    "<a:xfrm>" +
    '<a:off x="0" y="0"/>' +
    `<a:ext cx="${cxEmu}" cy="${cyEmu}"/>` +
    "</a:xfrm>" +
    '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>' +
    "</pic:spPr>" +
    "</pic:pic>" +
    "</a:graphicData>" +
    "</a:graphic>" +
    "</wp:inline>" +
    "</w:drawing>" +
    ""
  );
}

/** Build a centered `<w:p>` containing one image drawing (used by numbered photo slots). */
export function buildPhotoParagraphXml(entry: PhotoEntry): string {
  return (
    "<w:p>" +
    '<w:pPr><w:jc w:val="center"/></w:pPr>' +
    "<w:r>" +
    imageDrawingXml(entry) +
    "</w:r>" +
    "</w:p>" +
    ""
  );
}

function imageCell(entry: PhotoEntry): string {
  return (
    "<w:tc>" +
    "<w:tcPr>" +
    `<w:tcW w:w="${CELL_WIDTH_DXA}" w:type="dxa"/>` +
    '<w:tcMar><w:left w:w="120" w:type="dxa"/><w:right w:w="120" w:type="dxa"/><w:top w:w="120" w:type="dxa"/><w:bottom w:w="120" w:type="dxa"/></w:tcMar>' +
    CELL_BORDERS +
    "</w:tcPr>" +
    buildPhotoParagraphXml(entry) +
    "</w:tc>"
  );
}

function emptyCell(): string {
  return (
    "<w:tc>" +
    "<w:tcPr>" +
    `<w:tcW w:w="${CELL_WIDTH_DXA}" w:type="dxa"/>` +
    '<w:tcMar><w:left w:w="120" w:type="dxa"/><w:right w:w="120" w:type="dxa"/><w:top w:w="120" w:type="dxa"/><w:bottom w:w="120" w:type="dxa"/></w:tcMar>' +
    CELL_BORDERS +
    "</w:tcPr>" +
    '<w:p><w:pPr><w:jc w:val="center"/></w:pPr></w:p>' +
    "</w:tc>"
  );
}

/** Build the OOXML `<w:tbl>` for a photo grid. Empty input → empty string. */
export function buildPhotoTableXml(photos: readonly PhotoEntry[]): string {
  if (photos.length === 0) return "";
  const rowCount = Math.ceil(photos.length / COLS_PER_ROW);
  let rows = "";
  for (let r = 0; r < rowCount; r++) {
    let cells = "";
    for (let c = 0; c < COLS_PER_ROW; c++) {
      const idx = r * COLS_PER_ROW + c;
      cells += idx < photos.length ? imageCell(photos[idx]!) : emptyCell();
    }
    rows += `<w:tr>${cells}</w:tr>`;
  }
  return `${TABLE_OPEN}${rows}${TABLE_CLOSE}`;
}
