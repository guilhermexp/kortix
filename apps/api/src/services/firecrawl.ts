import { env } from "../env"

type FirecrawlConvertResponse = {
  success: boolean
  data?: {
    markdown?: string
    metadata?: Record<string, unknown>
    title?: string
  }
  error?: string
}

export async function convertUrlWithFirecrawl(url: string) {
  if (!env.FIRECRAWL_API_KEY) {
    throw new Error("Firecrawl API key not configured")
  }

  const response = await fetch("https://api.firecrawl.dev/v1/convert", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.FIRECRAWL_API_KEY}`,
    },
    body: JSON.stringify({ url }),
  })

  if (!response.ok) {
    const message = await response.text().catch(() => response.statusText)
    throw new Error(`Firecrawl convert failed: ${response.status} ${message}`)
  }

  const payload = (await response.json()) as FirecrawlConvertResponse
  if (!payload.success || !payload.data) {
    throw new Error(`Firecrawl convert returned error: ${payload.error ?? "unknown"}`)
  }

  return {
    markdown: payload.data.markdown ?? "",
    metadata: payload.data.metadata ?? {},
  }
}
