/**
 * Test script to validate authentication and document deduplication fixes
 */

import { extractAccessToken } from "./src/session"

// Test extractAccessToken function
console.log("Testing extractAccessToken...")

// Test 1: Bearer token in header
const testRequest1 = new Request("http://localhost", {
	headers: {
		Authorization: "Bearer test-token-123",
	},
})
const cookies1: Record<string, string> = {}
const token1 = extractAccessToken(testRequest1, cookies1)
console.assert(
	token1 === "test-token-123",
	`Test 1 failed: Expected "test-token-123", got "${token1}"`,
)
console.log("✓ Test 1 passed: Bearer token extraction")

// Test 2: JWT token in kortix_session cookie
const testRequest2 = new Request("http://localhost")
const cookies2: Record<string, string> = {
	kortix_session: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test",
}
const token2 = extractAccessToken(testRequest2, cookies2)
console.assert(
	token2 === "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test",
	`Test 2 failed: Expected JWT token, got "${token2}"`,
)
console.log("✓ Test 2 passed: JWT token from cookie")

// Test 3: Supabase auth cookie (JSON format)
const testRequest3 = new Request("http://localhost")
const cookies3: Record<string, string> = {
	"sb-project-auth-token": JSON.stringify({
		access_token: "supabase-token-456",
	}),
}
const token3 = extractAccessToken(testRequest3, cookies3)
console.assert(
	token3 === "supabase-token-456",
	`Test 3 failed: Expected "supabase-token-456", got "${token3}"`,
)
console.log("✓ Test 3 passed: Supabase cookie (JSON)")

// Test 4: Supabase auth cookie (raw token)
const testRequest4 = new Request("http://localhost")
const cookies4: Record<string, string> = {
	"sb-project-auth-token": "raw-supabase-token",
}
const token4 = extractAccessToken(testRequest4, cookies4)
console.assert(
	token4 === "raw-supabase-token",
	`Test 4 failed: Expected "raw-supabase-token", got "${token4}"`,
)
console.log("✓ Test 4 passed: Supabase cookie (raw)")

// Test 5: No token available
const testRequest5 = new Request("http://localhost")
const cookies5: Record<string, string> = {}
const token5 = extractAccessToken(testRequest5, cookies5)
console.assert(token5 === null, `Test 5 failed: Expected null, got "${token5}"`)
console.log("✓ Test 5 passed: No token returns null")

// Test 6: Priority - Bearer header takes precedence over cookie
const testRequest6 = new Request("http://localhost", {
	headers: {
		Authorization: "Bearer header-token",
	},
})
const cookies6: Record<string, string> = {
	kortix_session: "cookie-token",
}
const token6 = extractAccessToken(testRequest6, cookies6)
console.assert(
	token6 === "header-token",
	`Test 6 failed: Expected "header-token", got "${token6}"`,
)
console.log("✓ Test 6 passed: Header takes precedence over cookie")

console.log("\n✅ All extractAccessToken tests passed!")
