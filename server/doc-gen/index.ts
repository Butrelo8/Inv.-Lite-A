import type { Express } from "express";
import { registerDocGenDocumentRoutes } from "./documents/documents.routes";
import { registerDocGenTemplateRoutes } from "./templates/templates.routes";

export { shutdownPdfService } from "./pdf/pdf.service";
export { templateService } from "./templates/templates.service";
export { renderingService } from "./rendering/rendering.service";
export { documentGenerationService } from "./documents/documents.service";

export function registerDocGenRoutes(app: Express): void {
  registerDocGenTemplateRoutes(app);
  registerDocGenDocumentRoutes(app);
}
