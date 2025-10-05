import { z } from "zod"

const envSchema = z.object({
	AUTH_SECRET: z.string().min(32, "AUTH_SECRET must be at least 32 characters"),
	APP_URL: z.string().url().default("http://localhost:3000"),
	SUPABASE_DATABASE_URL: z.string().min(1, "SUPABASE_DATABASE_URL is required"),
	SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
	SUPABASE_URL: z.string().optional(),
	AUTH_COOKIE_NAME: z.string().optional(),
	AUTH_COOKIE_DOMAIN: z.string().optional(),
	RESEND_API_KEY: z.string().optional(),
	RESEND_FROM_EMAIL: z.string().email().optional().default("noreply@localhost"),
	NODE_ENV: z
		.enum(["development", "test", "production"])
		.default("development"),
})

const parsed = envSchema.safeParse({
	AUTH_SECRET: process.env.AUTH_SECRET,
	APP_URL: process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL,
	SUPABASE_DATABASE_URL: process.env.SUPABASE_DATABASE_URL,
	SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
	SUPABASE_URL: process.env.SUPABASE_URL,
	AUTH_COOKIE_NAME: process.env.AUTH_COOKIE_NAME,
	AUTH_COOKIE_DOMAIN: process.env.AUTH_COOKIE_DOMAIN,
	RESEND_API_KEY: process.env.RESEND_API_KEY,
	RESEND_FROM_EMAIL: process.env.RESEND_FROM_EMAIL,
	NODE_ENV: process.env.NODE_ENV ?? "development",
})

if (!parsed.success) {
	console.error("Invalid auth environment", parsed.error.flatten().fieldErrors)
	throw new Error("Invalid auth environment configuration")
}

export const env = parsed.data
