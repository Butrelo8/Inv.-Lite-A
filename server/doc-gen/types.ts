import type { DocTemplatePageConfig, DocTemplateVariable } from "@shared/schema";

export type { DocTemplatePageConfig, DocTemplateVariable };

/** Request payload for orchestrated document generation. */
export interface GenerateDocumentRequest {
  templateId: number;
  data: Record<string, unknown>;
  format: OutputFormat;
  filename?: string;
}

export type OutputFormat = "pdf" | "docx" | "html";

export interface GeneratedDocument {
  buffer: Buffer;
  mimeType: string;
  extension: string;
  suggestedFilename: string;
}

export interface PdfRenderOptions extends DocTemplatePageConfig {
  /** Puppeteer displayHeaderFooter HTML templates (optional). */
  headerTemplate?: string;
  footerTemplate?: string;
}

export interface DocxRenderOptions {
  table?: { row?: { cantSplit?: boolean } };
  footer?: boolean;
  pageNumber?: boolean;
}

export interface TemplateListFilters {
  category?: string;
  activeOnly?: boolean;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}
