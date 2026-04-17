import type { DocTemplate } from "@shared/schema";
import { httpStatusError } from "../../http-status-error";
import { htmlToPdf } from "../pdf/pdf.service";
import { htmlToDocx } from "../word/word.service";
import { renderingService } from "../rendering/rendering.service";
import { templateService } from "../templates/templates.service";
import type { GenerateDocumentRequest, GeneratedDocument, OutputFormat } from "../types";

function sanitizeFilename(base: string, ext: string): string {
  const cleaned = base.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^_+|_+$/g, "") || "document";
  return `${cleaned}.${ext}`;
}

function mimeForFormat(format: OutputFormat): { mime: string; ext: string } {
  switch (format) {
    case "pdf":
      return { mime: "application/pdf", ext: "pdf" };
    case "docx":
      return {
        mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ext: "docx",
      };
    case "html":
      return { mime: "text/html; charset=utf-8", ext: "html" };
    default: {
      const _exhaustive: never = format;
      return _exhaustive;
    }
  }
}

export class DocumentGenerationService {
  async generateDocument(req: GenerateDocumentRequest): Promise<GeneratedDocument> {
    const template = await templateService.getByIdOrThrow(req.templateId);
    const validation = renderingService.validateData(template.variables, req.data);
    if (!validation.valid) {
      const err = httpStatusError(400, validation.errors.join("; "));
      (err as Error & { details?: string[] }).details = validation.errors;
      throw err;
    }

    const html = renderingService.renderFull(template, req.data);
    const { mime, ext } = mimeForFormat(req.format);

    let buffer: Buffer;
    switch (req.format) {
      case "pdf":
        buffer = await htmlToPdf(html, {
          ...template.pageConfig,
        });
        break;
      case "docx":
        buffer = await htmlToDocx(html);
        break;
      case "html":
        buffer = Buffer.from(html, "utf-8");
        break;
      default: {
        const _exhaustive: never = req.format;
        return _exhaustive;
      }
    }

    const nameBase = req.filename?.trim() || template.slug || template.name || "document";
    return {
      buffer,
      mimeType: mime,
      extension: ext,
      suggestedFilename: sanitizeFilename(nameBase.replace(/\.(pdf|docx|html)$/i, ""), ext),
    };
  }

  async previewHtml(templateId: number, data: Record<string, unknown>): Promise<string> {
    const template = await templateService.getByIdOrThrow(templateId);
    const validation = renderingService.validateData(template.variables, data);
    if (!validation.valid) {
      const err = httpStatusError(400, validation.errors.join("; "));
      (err as Error & { details?: string[] }).details = validation.errors;
      throw err;
    }
    return renderingService.renderFull(template, data);
  }

  collectTemplateVariableHints(template: DocTemplate): { declared: typeof template.variables; inferred: string[] } {
    const header = template.headerHtml ?? "";
    const body = template.bodyHtml ?? "";
    const footer = template.footerHtml ?? "";
    const inferred = Array.from(
      new Set([
        ...renderingService.extractVariables(header),
        ...renderingService.extractVariables(body),
        ...renderingService.extractVariables(footer),
      ])
    ).sort();
    return { declared: template.variables, inferred };
  }
}

export const documentGenerationService = new DocumentGenerationService();
