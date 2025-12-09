import { createClient } from "@supabase/supabase-js"
import { config } from "dotenv"
import { resolve } from "path"

// Load env from multiple locations
config({ path: ".env.local" })
config({ path: resolve(process.cwd(), "..", "..", ".env.local") })
config()

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

console.log("SUPABASE_URL:", SUPABASE_URL ? "Set" : "Not set")
console.log("SERVICE_KEY:", SUPABASE_SERVICE_ROLE_KEY ? "Set" : "Not set")

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing environment variables")
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
})

const userId = "d100056c-6a43-43b7-8864-6ee9c88d92da"
const newPassword = "Senha123!"

console.log("Resetting password for user:", userId)

const { data, error } = await supabase.auth.admin.updateUserById(userId, {
  password: newPassword
})

if (error) {
  console.error("Error:", error)
  process.exit(1)
}

console.log("Password reset successfully!")
console.log("User:", data.user?.email)
