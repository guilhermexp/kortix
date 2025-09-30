import { z } from "zod"

const envSchema = z.object({
  PORT: z
    .string()
    .regex(/^\d+$/)
    .transform((value) => Number.parseInt(value, 10))
    .default("4000"),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  SUPABASE_ANON_KEY: z.string().min(1).optional(),
  GOOGLE_API_KEY: z.string().min(1).optional(),
  EMBEDDING_MODEL: z.string().default("text-embedding-004"),
  EMBEDDING_DIMENSION: z
    .string()
    .regex(/^\d+$/)
    .transform((value) => Number.parseInt(value, 10))
    .default("1536"),
  CHAT_MODEL: z.string().default("models/gemini-2.5-pro"),
  SUMMARY_MODEL: z.string().optional(),
  FIRECRAWL_API_KEY: z.string().optional(),
  INGESTION_BATCH_SIZE: z
    .string()
    .regex(/^\d+$/)
    .transform((value) => Number.parseInt(value, 10))
    .default("5"),
  INGESTION_POLL_MS: z
    .string()
    .regex(/^\d+$/)
    .transform((value) => Number.parseInt(value, 10))
    .default("5000"),
  INGESTION_MAX_ATTEMPTS: z
    .string()
    .regex(/^\d+$/)
    .transform((value) => Number.parseInt(value, 10))
    .default("5"),
  DEFAULT_ADMIN_EMAIL: z.string().email().optional(),
  APP_URL: z.string().url().default("http://localhost:3000"),
  RESEND_API_KEY: z.string().min(1).optional(),
  RESEND_FROM_EMAIL: z.string().email().optional().default("noreply@localhost"),
  ALLOWED_ORIGINS: z
    .string()
    .default("http://localhost:3000,http://localhost:3001")
    .transform((value) =>
      value
        .split(",")
        .map((origin) => origin.trim())
        .filter((origin) => origin.length > 0),
    ),
})

const parsed = envSchema.safeParse({
  PORT: process.env.PORT ?? "4000",
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
  GOOGLE_API_KEY: process.env.GOOGLE_API_KEY,
  EMBEDDING_MODEL: process.env.EMBEDDING_MODEL,
  EMBEDDING_DIMENSION: process.env.EMBEDDING_DIMENSION,
  CHAT_MODEL: process.env.CHAT_MODEL,
  SUMMARY_MODEL: process.env.SUMMARY_MODEL,
  FIRECRAWL_API_KEY: process.env.FIRECRAWL_API_KEY,
  INGESTION_BATCH_SIZE: process.env.INGESTION_BATCH_SIZE,
  INGESTION_POLL_MS: process.env.INGESTION_POLL_MS,
  INGESTION_MAX_ATTEMPTS: process.env.INGESTION_MAX_ATTEMPTS,
  DEFAULT_ADMIN_EMAIL: process.env.DEFAULT_ADMIN_EMAIL ?? "admin@local.host",
  APP_URL: process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL,
  RESEND_API_KEY: process.env.RESEND_API_KEY,
  RESEND_FROM_EMAIL: process.env.RESEND_FROM_EMAIL,
  ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS,
})

if (!parsed.success) {
  console.error("Invalid environment variables", parsed.error.flatten().fieldErrors)
  throw new Error("Invalid environment configuration")
}

export const env = parsed.data
