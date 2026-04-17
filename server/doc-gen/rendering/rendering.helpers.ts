import type Handlebars from "handlebars";
import { format, isValid, parseISO } from "date-fns";
import { es } from "date-fns/locale";

function coerceDate(value: unknown): Date | null {
  if (value == null) return null;
  if (value instanceof Date) return isValid(value) ? value : null;
  if (typeof value === "number" && Number.isFinite(value)) {
    const d = new Date(value);
    return isValid(d) ? d : null;
  }
  if (typeof value === "string") {
    const d = parseISO(value);
    if (isValid(d)) return d;
    const d2 = new Date(value);
    return isValid(d2) ? d2 : null;
  }
  return null;
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

/** Register helpers on a dedicated Handlebars instance (not global). */
export function registerRenderingHelpers(hbs: typeof Handlebars): void {
  hbs.registerHelper("formatDate", (value: unknown, pattern?: unknown) => {
    const fmt = typeof pattern === "string" && pattern.length > 0 ? pattern : "dd/MM/yyyy";
    const d = coerceDate(value);
    if (!d) return "";
    try {
      return format(d, fmt, { locale: es });
    } catch {
      return format(d, "dd/MM/yyyy", { locale: es });
    }
  });

  hbs.registerHelper("currency", (value: unknown, currencyCode?: unknown) => {
    const code = typeof currencyCode === "string" && currencyCode.length > 0 ? currencyCode : "EUR";
    const n = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(n)) return "";
    try {
      return new Intl.NumberFormat("es-ES", { style: "currency", currency: code }).format(n);
    } catch {
      return String(n);
    }
  });

  hbs.registerHelper("ifEquals", function (this: unknown, a: unknown, b: unknown, options: Handlebars.HelperOptions) {
    if (a === b) {
      return options.fn(this);
    }
    return options.inverse(this);
  });

  /**
   * Renders a grid of images from URL strings or `{ url, alt }` objects.
   * Usage: `{{{fotos fotos}}}` (triple stash).
   */
  hbs.registerHelper("fotos", (items: unknown) => {
    const list = Array.isArray(items) ? items : [];
    const cells = list
      .map((item) => {
        const url = typeof item === "string" ? item : (item as { url?: string })?.url;
        const alt =
          typeof item === "object" && item != null && "alt" in item
            ? String((item as { alt?: string }).alt ?? "")
            : "";
        if (!url || typeof url !== "string") return "";
        return `<div class="doc-photo-cell"><img src="${escapeAttr(url)}" alt="${escapeAttr(alt)}" /></div>`;
      })
      .join("");
    return new hbs.SafeString(`<div class="doc-photo-grid">${cells}</div>`);
  });
}
