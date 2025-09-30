import {
  AnalyticsChatResponseSchema,
  AnalyticsMemoryResponseSchema,
  AnalyticsUsageResponseSchema,
} from "@repo/validation/api"
import { z } from "zod"

const analyticsRequestSchema = z.object({
  from: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  page: z.coerce.number().int().min(1).default(1),
  period: z.enum(["24h", "7d", "30d", "all"]).optional(),
  to: z.string().datetime().optional(),
})

function normalizeAnalyticsInput(input: unknown) {
  const record =
    input && typeof input === "object"
      ? (input as Record<string, unknown>)
      : {}

  const normalized: Record<string, unknown> = {}

  if (typeof record.from === "string") normalized.from = record.from
  if (typeof record.to === "string") normalized.to = record.to
  if (record.limit !== undefined) normalized.limit = record.limit
  if (record.page !== undefined) normalized.page = record.page
  if (typeof record.period === "string") normalized.period = record.period

  return analyticsRequestSchema.parse(normalized)
}

export function getAnalyticsChat(input: unknown) {
  const payload = normalizeAnalyticsInput(input)

  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][new Date().getDay()] as
    | "Sun"
    | "Mon"
    | "Tue"
    | "Wed"
    | "Thu"
    | "Fri"
    | "Sat"

  return AnalyticsChatResponseSchema.parse({
    analytics: {
      apiUsage: { current: 0, limit: 100000 },
      latency: { current: 0, trend: [0, 0, 0, 0, 0, 0, 0], unit: "ms" },
    usage: {
      currentDay: weekday,
        tokensByDay: {
          Sun: 0,
          Mon: 0,
          Tue: 0,
          Wed: 0,
          Thu: 0,
          Fri: 0,
          Sat: 0,
        },
      },
    },
    overview: {
      "7d": {
        amountSaved: { current: 0, previousPeriod: 0 },
        tokensProcessed: { current: 0, previousPeriod: 0 },
        tokensSent: { current: 0, previousPeriod: 0 },
        totalTokensSaved: { current: 0, previousPeriod: 0 },
      },
      "30d": {
        amountSaved: { current: 0, previousPeriod: 0 },
        tokensProcessed: { current: 0, previousPeriod: 0 },
        tokensSent: { current: 0, previousPeriod: 0 },
        totalTokensSaved: { current: 0, previousPeriod: 0 },
      },
      "90d": {
        amountSaved: { current: 0, previousPeriod: 0 },
        tokensProcessed: { current: 0, previousPeriod: 0 },
        tokensSent: { current: 0, previousPeriod: 0 },
        totalTokensSaved: { current: 0, previousPeriod: 0 },
      },
    },
  })
}

export function getAnalyticsMemory(input: unknown) {
  normalizeAnalyticsInput(input)

  return AnalyticsMemoryResponseSchema.parse({
    connectionsGrowth: 0,
    memoriesGrowth: 0,
    searchGrowth: 0,
    searchQueries: 0,
    tokensGrowth: 0,
    tokensProcessed: 0,
    totalConnections: 0,
    totalMemories: 0,
  })
}

export function getAnalyticsUsage(input: unknown) {
  const payload = normalizeAnalyticsInput(input)
  const limit = payload.limit ?? 20

  return AnalyticsUsageResponseSchema.parse({
    byKey: [],
    hourly: [],
    pagination: {
      currentPage: payload.page ?? 1,
      limit,
      totalItems: 0,
      totalPages: 1,
    },
    totalMemories: 0,
    usage: [],
  })
}
