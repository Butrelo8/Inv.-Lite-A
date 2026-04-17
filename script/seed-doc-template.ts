/**
 * Seeds a sample Handlebars template for document generation (idempotent by slug).
 * Run: npx tsx script/seed-doc-template.ts
 */
import "dotenv/config";
import { eq } from "drizzle-orm";
import { db } from "../server/db";
import { docTemplates } from "../shared/schema";
import { templateService } from "../server/doc-gen/templates/templates.service";

const SLUG = "acta-entrega";

async function main(): Promise<void> {
  const [existing] = await db.select({ id: docTemplates.id }).from(docTemplates).where(eq(docTemplates.slug, SLUG)).limit(1);
  if (existing) {
    console.log(`Template "${SLUG}" already exists (id=${existing.id}). Skip.`);
    return;
  }

  await templateService.create({
    slug: SLUG,
    name: "Acta de entrega",
    description: "Plantilla de ejemplo para entrega de activo (prueba doc-gen).",
    bodyHtml: `
<h1>Acta de entrega</h1>
<p><strong>Fecha:</strong> {{formatDate fecha "dd/MM/yyyy"}}</p>
<p><strong>Responsable:</strong> {{nombre}}</p>
<p><strong>Objeto / descripción:</strong> {{objeto}}</p>
<p><strong>Serie / identificador:</strong> {{serie}}</p>
<h2>Evidencia fotográfica</h2>
{{{fotos fotos}}}
<p class="muted">Documento generado automáticamente.</p>
`.trim(),
    headerHtml: `<p class="header-brand">Inventario — Acta de entrega</p>`,
    footerHtml: `<p>Página generada el {{formatDate fecha "dd/MM/yyyy HH:mm"}}</p>`,
    cssStyles: `
      .header-brand { font-size: 12px; color: #444; border-bottom: 1px solid #ddd; padding-bottom: 8px; }
      .muted { color: #666; font-size: 12px; margin-top: 24px; }
    `.trim(),
    variables: [
      { key: "nombre", label: "Nombre del responsable", type: "text", required: true },
      { key: "objeto", label: "Objeto o descripción", type: "text", required: true },
      { key: "serie", label: "Serie o código", type: "text", required: false },
      { key: "fecha", label: "Fecha del acta", type: "date", required: true },
      { key: "fotos", label: "URLs de fotos", type: "list", required: false },
    ],
    pageConfig: { format: "A4", printBackground: true },
    category: "acta_entrega",
    version: 1,
    active: true,
    createdByUserId: null,
  });

  console.log(`Seeded template "${SLUG}".`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
