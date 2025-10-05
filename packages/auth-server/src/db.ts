import { drizzle } from "drizzle-orm/node-postgres"
import { Pool } from "pg"
import { env } from "./env"
import * as schema from "./schema"

export const pool = new Pool({
	connectionString: env.SUPABASE_DATABASE_URL,
	ssl: { rejectUnauthorized: false },
})

export const db = drizzle(pool, {
	schema,
})
