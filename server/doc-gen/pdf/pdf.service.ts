import puppeteer, { type Browser } from "puppeteer";
import type { PdfRenderOptions } from "../types";

let browserPromise: Promise<Browser> | null = null;

function defaultMargins(): { top: string; right: string; bottom: string; left: string } {
  return { top: "12mm", right: "12mm", bottom: "12mm", left: "12mm" };
}

async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    });
  }
  return browserPromise;
}

/**
 * Converts a full HTML document string to a PDF buffer using Puppeteer.
 */
export async function htmlToPdf(html: string, options: PdfRenderOptions = {}): Promise<Buffer> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: "networkidle0", timeout: 60_000 });
    const format = options.format === "Letter" ? "Letter" : "A4";
    const landscape = Boolean(options.landscape);
    const margins = options.margins ?? defaultMargins();
    const printBackground = options.printBackground !== false;
    const pdf = await page.pdf({
      format,
      landscape,
      printBackground,
      margin: margins,
      displayHeaderFooter: Boolean(options.headerTemplate || options.footerTemplate),
      headerTemplate: options.headerTemplate ?? "",
      footerTemplate: options.footerTemplate ?? "",
    });
    return Buffer.from(pdf);
  } finally {
    await page.close();
  }
}

/** Close the shared browser (e.g. on process shutdown). */
export async function shutdownPdfService(): Promise<void> {
  if (!browserPromise) return;
  try {
    const b = await browserPromise;
    await b.close();
  } catch {
    // ignore
  } finally {
    browserPromise = null;
  }
}
