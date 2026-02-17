import { z } from "zod"

const envSchema = z.object({
	PORT: z.coerce.number().default(4000),
	SUPABASE_URL: z.string().url(),
	SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
	SUPABASE_ANON_KEY: z.string().min(1), // Required for RLS enforcement
	GOOGLE_API_KEY: z.string().min(1).optional(),
	ANTHROPIC_API_KEY: z.string().min(1),
	ANTHROPIC_BASE_URL: z.string().url().optional(),
	COHERE_API_KEY: z.string().min(1).optional(),
	EXA_API_KEY: z.string().min(1).optional(),
	REPLICATE_API_TOKEN: z.string().min(1).optional(),
	ENABLE_AGENTIC_MODE: z
		.string()
		.optional()
		.transform((value) => value !== "false"),
	ENABLE_RERANKING: z
		.string()
		.optional()
		.transform((value) => value !== "false"),
	EMBEDDING_MODEL: z.string().default("text-embedding-004"),
	EMBEDDING_DIMENSION: z.coerce.number().default(1536),
	CHAT_MODEL: z.string().default("claude-3-5-sonnet-20241022"),
	SUMMARY_MODEL: z.string().optional(),
	ENABLE_RECENCY_BOOST: z
		.string()
		.optional()
		.transform((value) => value === "true"),
	RECENCY_WEIGHT: z.coerce.number().min(0).max(1).default(0.2),
	RECENCY_HALF_LIFE_DAYS: z.coerce.number().default(14),
	INGESTION_BATCH_SIZE: z.coerce.number().default(5),
	INGESTION_POLL_MS: z.coerce.number().default(5000),
	INGESTION_MAX_ATTEMPTS: z.coerce.number().default(5),
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
	// OpenRouter (fallback provider)
	OPENROUTER_API_KEY: z.string().min(1).optional(),
	OPENROUTER_SITE_URL: z.string().url().optional(),
	OPENROUTER_SITE_NAME: z.string().min(1).optional(),
	OPENROUTER_MODEL: z.string().optional(),
	// Voyage AI (embeddings provider)
	VOYAGE_API_KEY: z.string().min(1).optional(),
	// Kimi AI provider key
	KIMI_API_KEY: z.string().min(1),
	OPENROUTER_TEMPERATURE: z
		.string()
		.optional()
		.transform((v) => (v != null ? Number(v) : undefined))
		.refine(
			(v) => v === undefined || (typeof v === "number" && v >= 0 && v <= 2),
			{
				message: "OPENROUTER_TEMPERATURE must be between 0 and 2",
			},
		),
	OPENROUTER_MAX_TOKENS: z
		.string()
		.optional()
		.transform((v) => (v != null ? Number.parseInt(v, 10) : undefined))
		.refine(
			(v) =>
				v === undefined ||
				(typeof v === "number" && Number.isFinite(v) && v > 0),
			{
				message: "OPENROUTER_MAX_TOKENS must be a positive integer",
			},
		),
	// Optional: configure external MCP (sequential thinking) server spawn command
	SEQ_MCP_COMMAND: z.string().min(1).optional(),
	// JSON array of args, e.g.: ["--flag", "value"]
	SEQ_MCP_ARGS: z.string().optional(),
	// Enable sequential thinking MCP server (requires SEQ_MCP_COMMAND to be set)
	SEQ_MCP_ENABLED: z.string().optional().default("false"),
	// Enable deepwiki MCP server for external research
	DEEPWIKI_ENABLED: z.string().optional().default("false"),
	// LLM Council backend URL
	LLM_COUNCIL_URL: z.string().url().optional().default("http://localhost:8001"),
	COUNCIL_MODELS: z.string().optional(),
	COUNCIL_CHAIRMAN_MODEL: z.string().optional(),
})

const parsed = envSchema.safeParse({
	PORT: process.env.PORT ?? "4000",
	SUPABASE_URL: process.env.SUPABASE_URL,
	SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
	SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
	GOOGLE_API_KEY: process.env.GOOGLE_API_KEY,
	ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
	ANTHROPIC_BASE_URL: process.env.ANTHROPIC_BASE_URL,
	COHERE_API_KEY: process.env.COHERE_API_KEY,
	EXA_API_KEY: process.env.EXA_API_KEY,
	REPLICATE_API_TOKEN: process.env.REPLICATE_API_TOKEN,
	ENABLE_AGENTIC_MODE: process.env.ENABLE_AGENTIC_MODE,
	ENABLE_RERANKING: process.env.ENABLE_RERANKING,
	EMBEDDING_MODEL: process.env.EMBEDDING_MODEL,
	EMBEDDING_DIMENSION: process.env.EMBEDDING_DIMENSION,
	CHAT_MODEL: process.env.CHAT_MODEL,
	SUMMARY_MODEL: process.env.SUMMARY_MODEL,
	ENABLE_RECENCY_BOOST: process.env.ENABLE_RECENCY_BOOST,
	RECENCY_WEIGHT: process.env.RECENCY_WEIGHT,
	RECENCY_HALF_LIFE_DAYS: process.env.RECENCY_HALF_LIFE_DAYS,
	INGESTION_BATCH_SIZE: process.env.INGESTION_BATCH_SIZE,
	INGESTION_POLL_MS: process.env.INGESTION_POLL_MS,
	INGESTION_MAX_ATTEMPTS: process.env.INGESTION_MAX_ATTEMPTS,
	DEFAULT_ADMIN_EMAIL: process.env.DEFAULT_ADMIN_EMAIL ?? "admin@local.host",
	APP_URL: process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL,
	RESEND_API_KEY: process.env.RESEND_API_KEY,
	RESEND_FROM_EMAIL: process.env.RESEND_FROM_EMAIL,
	ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS,
	OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
	OPENROUTER_SITE_URL: process.env.OPENROUTER_SITE_URL,
	OPENROUTER_SITE_NAME: process.env.OPENROUTER_SITE_NAME,
	OPENROUTER_MODEL: process.env.OPENROUTER_MODEL,
	OPENROUTER_TEMPERATURE: process.env.OPENROUTER_TEMPERATURE,
	OPENROUTER_MAX_TOKENS: process.env.OPENROUTER_MAX_TOKENS,
	VOYAGE_API_KEY: process.env.VOYAGE_API_KEY,
	KIMI_API_KEY: process.env.KIMI_API_KEY,
	SEQ_MCP_COMMAND: process.env.SEQ_MCP_COMMAND,
	SEQ_MCP_ARGS: process.env.SEQ_MCP_ARGS,
	SEQ_MCP_ENABLED: process.env.SEQ_MCP_ENABLED,
	DEEPWIKI_ENABLED: process.env.DEEPWIKI_ENABLED,
	LLM_COUNCIL_URL: process.env.LLM_COUNCIL_URL,
	COUNCIL_MODELS: process.env.COUNCIL_MODELS,
	COUNCIL_CHAIRMAN_MODEL: process.env.COUNCIL_CHAIRMAN_MODEL,
})

if (!parsed.success) {
	console.error(
		"Invalid environment variables",
		parsed.error.flatten().fieldErrors,
	)
	throw new Error("Invalid environment configuration")
}

export const env = parsed.data
