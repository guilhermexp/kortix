declare module "pdf-parse" {
  interface PdfParseResult {
    text: string
    info?: Record<string, unknown>
    metadata?: Record<string, unknown>
  }

  function pdfParse(
    data: Buffer | Uint8Array,
    options?: Record<string, unknown>,
  ): Promise<PdfParseResult>

  export = pdfParse
}
