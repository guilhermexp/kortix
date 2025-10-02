import { env } from "../env"

type FirecrawlScrapeResponse = {
  success: boolean
  data?: {
    markdown?: string
    metadata?: Record<string, unknown>
    title?: string
    ogImage?: string
    ogTitle?: string
    ogDescription?: string
    ogUrl?: string
  }
  error?: string
}

export async function convertUrlWithFirecrawl(url: string) {
  if (!env.FIRECRAWL_API_KEY) {
    throw new Error("Firecrawl API key not configured")
  }

  const response = await fetch("https://api.firecrawl.dev/v1/scrape", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.FIRECRAWL_API_KEY}`,
    },
    body: JSON.stringify({ 
      url,
      formats: ["markdown"],
      onlyMainContent: true,
    }),
  })

  if (!response.ok) {
    const message = await response.text().catch(() => response.statusText)
    throw new Error(`Firecrawl scrape failed: ${response.status} ${message}`)
  }

  const payload = (await response.json()) as FirecrawlScrapeResponse
  if (!payload.success || !payload.data) {
    throw new Error(`Firecrawl scrape returned error: ${payload.error ?? "unknown"}`)
  }

  const data = payload.data
  const metadata: Record<string, unknown> = {
    ...(data.metadata ?? {}),
  }

  // Extract Open Graph data
  if (data.ogImage) metadata.ogImage = data.ogImage
  if (data.ogTitle) metadata.ogTitle = data.ogTitle
  if (data.ogDescription) metadata.ogDescription = data.ogDescription
  if (data.ogUrl) metadata.ogUrl = data.ogUrl

  return {
    markdown: data.markdown ?? "",
    metadata,
  }
}
