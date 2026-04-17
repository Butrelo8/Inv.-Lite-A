import type { Express } from "express";
import { registerDocGenDocumentRoutes } from "./documents/documents.routes";
import { registerDocGenTemplateRoutes } from "./templates/templates.routes";
import { registerResponsivaRoutesDefault } from "./responsiva";

export { shutdownPdfService } from "./pdf/pdf.service";
export { templateService } from "./templates/templates.service";
export { renderingService } from "./rendering/rendering.service";
export { documentGenerationService } from "./documents/documents.service";
export { generateResponsivaDocx } from "./responsiva";

export async function registerDocGenRoutes(app: Express): Promise<void> {
  registerDocGenTemplateRoutes(app);
  registerDocGenDocumentRoutes(app);
  await registerResponsivaRoutesDefault(app);
}
