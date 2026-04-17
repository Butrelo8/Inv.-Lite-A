declare module "heic-convert";

declare module "html-to-docx" {
  type HtmlToDocxOptions = {
    table?: { row?: { cantSplit?: boolean } };
    footer?: boolean;
    pageNumber?: boolean;
  };
  function htmlToDocx(
    htmlString: string,
    headerHTMLString: string | null,
    options?: HtmlToDocxOptions,
  ): Promise<ArrayBuffer | Buffer | Uint8Array>;
  export default htmlToDocx;
}
