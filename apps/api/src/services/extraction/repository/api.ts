import { safeFetch } from "../../../security/url-validator"

export async function makeApiRequest(baseUrl: string, url: string, apiKey?: string, rate: { remaining: number; reset: number }) {
  if (rate.remaining <= 1 && Date.now() < rate.reset) {
    const wait = rate.reset - Date.now()
    await new Promise((r) => setTimeout(r, wait))
  }
  const headers: Record<string, string> = { Accept: "application/vnd.github.v3+json", "User-Agent": "Supermemory-Bot/1.0" }
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`
  const response = await safeFetch(url, { headers })
  const remaining = response.headers.get("x-ratelimit-remaining")
  const reset = response.headers.get("x-ratelimit-reset")
  if (remaining) rate.remaining = parseInt(remaining, 10)
  if (reset) rate.reset = parseInt(reset, 10) * 1000
  if (!response.ok) {
    const text = await response.text()
    throw new Error(`GitHub API request failed: ${response.status} ${text}`)
  }
  return response
}
