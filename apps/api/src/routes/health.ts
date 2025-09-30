import type { Context } from "hono"

export const healthHandler = (c: Context) => {
  return c.json({ status: "ok", timestamp: new Date().toISOString() })
}
