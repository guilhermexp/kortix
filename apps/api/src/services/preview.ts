type PreviewInput = {
  contentType?: string | null
  filename?: string | null
  title?: string | null
  url?: string | null
  text?: string | null
  raw?: Record<string, unknown> | null
}

function escapeXml(s: string): string {
  return (s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}

function lineClamp(text: string, maxChars: number): string {
  const t = (text || "").replace(/\s+/g, " ").trim()
  if (t.length <= maxChars) return t
  return t.slice(0, Math.max(0, maxChars - 1)) + "…"
}

function dataUrlFromSvg(svg: string): string {
  return "data:image/svg+xml;utf8," + encodeURIComponent(svg)
}

function buildSvg({
  heading,
  subheading,
  theme,
  body,
}: {
  heading: string
  subheading?: string
  theme: "pdf" | "xlsx" | "doc"
  body?: string
}): string {
  const grad =
    theme === "pdf"
      ? ["#7f1d1d", "#ef4444"]
      : theme === "xlsx"
        ? ["#064e3b", "#10b981"]
        : ["#1f2937", "#6b7280"]
  const h = escapeXml(heading)
  const sh = escapeXml(subheading || "")
  const b = escapeXml(body || "")
  const svg = `
<svg xmlns='http://www.w3.org/2000/svg' width='640' height='400'>
  <defs>
    <linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>
      <stop offset='0%' stop-color='${grad[0]}'/>
      <stop offset='100%' stop-color='${grad[1]}'/>
    </linearGradient>
    <style>
      .t{font-family:system-ui,Segoe UI,Roboto,sans-serif; fill:#fff}
    </style>
  </defs>
  <rect width='100%' height='100%' fill='url(#g)'/>
  <rect x='24' y='24' width='160' height='32' rx='6' fill='rgba(255,255,255,0.2)'/>
  <text class='t' x='40' y='46' font-size='16' opacity='0.9'>${theme.toUpperCase()}</text>
  <text class='t' x='32' y='96' font-size='28' opacity='0.98'>${h}</text>
  ${sh ? `<text class='t' x='32' y='130' font-size='16' opacity='0.9'>${sh}</text>` : ''}
  ${b ? `<foreignObject x='32' y='160' width='576' height='208'>
    <div xmlns='http://www.w3.org/1999/xhtml' style='color:#fff;opacity:0.92;font:14px system-ui,Segoe UI,Roboto;line-height:1.35;white-space:normal;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:8;-webkit-box-orient:vertical;'>${b}</div>
  </foreignObject>` : ''}
</svg>`
  return dataUrlFromSvg(svg)
}

export function generatePreviewImage(input: PreviewInput): { url: string; source: string } | null {
  const ct = (input.contentType || "").toLowerCase()
  const fn = (input.filename || "").toLowerCase()
  const title = input.title || input.filename || "Document"
  const snippet = lineClamp(input.text || "", 600)

  // PDF: real-ish preview with title + snippet; page count if available
  if (ct.includes("pdf") || fn.endsWith(".pdf")) {
    let pages: string | undefined
    try {
      const info = (input.raw as any)?.info
      const numPages = typeof info?.Pages === "number" ? info.Pages : undefined
      if (numPages) pages = `${numPages} page${numPages === 1 ? "" : "s"}`
    } catch {}
    const sub = pages || undefined
    const url = buildSvg({ heading: title, subheading: sub, theme: "pdf", body: snippet })
    return { url, source: "generated:pdf" }
  }

  // XLSX/Sheets: spreadsheet-themed preview with filename and snippet
  if (
    ct.includes("spreadsheet") ||
    ct.includes("excel") ||
    fn.endsWith(".xls") ||
    fn.endsWith(".xlsx")
  ) {
    const url = buildSvg({ heading: title, subheading: "Spreadsheet", theme: "xlsx", body: snippet })
    return { url, source: "generated:xlsx" }
  }

  return null
}

