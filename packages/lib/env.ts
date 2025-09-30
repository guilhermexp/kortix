const DEFAULT_APP_URL = "http://localhost:3000"
const DEFAULT_BACKEND_URL = "http://localhost:4000"

export const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? DEFAULT_BACKEND_URL
export const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? DEFAULT_APP_URL
export const MCP_SERVER_URL =
  process.env.NEXT_PUBLIC_MCP_SERVER_URL ?? `${BACKEND_URL.replace(/\/$/, "")}/mcp`
export const DOCS_URL = process.env.NEXT_PUBLIC_DOCS_URL ?? `${APP_URL.replace(/\/$/, "")}/docs`

export const APP_HOSTNAME = (() => {
  try {
    return new URL(APP_URL).hostname
  } catch {
    return new URL(DEFAULT_APP_URL).hostname
  }
})()

