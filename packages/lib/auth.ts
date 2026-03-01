"use client"
// Auth module - v3 - fixed session persistence issues

import useSWR, { mutate } from "swr"

import { BACKEND_URL } from "./env"

const API_BASE = BACKEND_URL
const AUTH_TOKEN_KEY = "kortix_auth_token"
const AUTH_REFRESH_KEY = "kortix_refresh_token"

// Track if we're currently refreshing to avoid multiple simultaneous refreshes
let isRefreshing = false
let refreshPromise: Promise<boolean> | null = null

// Store tokens in localStorage for persistence
// Note: Cookie is set by the backend with httpOnly for security
function storeTokens(accessToken: string, refreshToken?: string) {
	if (typeof window !== "undefined") {
		localStorage.setItem(AUTH_TOKEN_KEY, accessToken)
		if (refreshToken) {
			localStorage.setItem(AUTH_REFRESH_KEY, refreshToken)
		}
		// Don't set cookie here - let the backend handle it with httpOnly for security
		// This avoids conflicts with sameSite attributes
	}
}

function clearTokens() {
	if (typeof window !== "undefined") {
		localStorage.removeItem(AUTH_TOKEN_KEY)
		localStorage.removeItem(AUTH_REFRESH_KEY)
	}
}

export function getStoredToken(): string | null {
	if (typeof window !== "undefined") {
		return localStorage.getItem(AUTH_TOKEN_KEY)
	}
	return null
}

function getStoredRefreshToken(): string | null {
	if (typeof window !== "undefined") {
		return localStorage.getItem(AUTH_REFRESH_KEY)
	}
	return null
}

/**
 * Attempt to refresh the session using the stored refresh token.
 * Returns true if successful, false otherwise.
 * Includes retry logic for transient network failures.
 */
async function tryRefreshSession(): Promise<boolean> {
	// If already refreshing, wait for that to complete
	if (isRefreshing && refreshPromise) {
		return refreshPromise
	}

	const refreshToken = getStoredRefreshToken()
	if (!refreshToken) {
		return false
	}

	isRefreshing = true
	refreshPromise = (async () => {
		const maxRetries = 2
		let lastError: Error | null = null

		for (let attempt = 0; attempt <= maxRetries; attempt++) {
			try {
				// Add small delay between retries
				if (attempt > 0) {
					await new Promise((resolve) => setTimeout(resolve, 500 * attempt))
				}

				const response = await fetch(`${API_BASE}/api/auth/refresh`, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ refresh_token: refreshToken }),
					credentials: "include",
				})

				if (!response.ok) {
					// Only clear tokens if it's an auth error (401), not network/server errors
					if (response.status === 401) {
						// Refresh token is invalid - user needs to re-login
						clearTokens()
						return false
					}
					// Server error - might be temporary, retry
					lastError = new Error(`Server returned ${response.status}`)
					continue
				}

				const data = await response.json()
				if (data?.session?.access_token) {
					storeTokens(data.session.access_token, data.session.refresh_token)
					return true
				}
				return false
			} catch (error) {
				// Network error - might be temporary
				lastError = error instanceof Error ? error : new Error("Network error")
			}
		}

		// All retries failed - don't clear tokens, might be temporary network issue
		console.warn("[auth] Refresh failed after retries:", lastError?.message)
		return false
	})()

	const result = await refreshPromise
	isRefreshing = false
	refreshPromise = null
	return result
}

/**
 * Decode JWT and get expiration time (in milliseconds since epoch)
 */
function getJwtExp(token: string): number | null {
	try {
		const parts = token.split(".")
		if (parts.length < 2) return null
		const payload = JSON.parse(
			atob(parts[1]?.replace(/-/g, "+").replace(/_/g, "/") ?? ""),
		)
		return typeof payload.exp === "number" ? payload.exp * 1000 : null
	} catch {
		return null
	}
}

/**
 * Check if token is expired or about to expire (within 5 minutes)
 */
function isTokenExpiringSoon(token: string | null): boolean {
	if (!token) return true
	const exp = getJwtExp(token)
	if (!exp) return false // Can't determine, assume valid
	return Date.now() > exp - 5 * 60 * 1000 // 5 minutes buffer
}

/**
 * Proactively refresh token if it's about to expire
 */
async function ensureFreshToken(): Promise<string | null> {
	const token = getStoredToken()
	if (!token) return null

	if (isTokenExpiringSoon(token)) {
		const refreshed = await tryRefreshSession()
		if (refreshed) {
			return getStoredToken()
		}
		// Refresh failed but we still have a token - let request proceed
		// It might still work if server clock is different
	}
	return token
}

async function request(
	path: string,
	init: RequestInit = {},
	retryOnAuthError = true,
) {
	// Proactively refresh token if expiring soon
	const token = await ensureFreshToken()
	const headers: Record<string, string> = {
		"Content-Type": "application/json",
		...((init.headers as Record<string, string>) ?? {}),
	}

	// Add Authorization header if we have a token
	if (token) {
		headers.Authorization = `Bearer ${token}`
	}

	const response = await fetch(`${API_BASE}${path}`, {
		...init,
		headers,
		credentials: "include",
	})

	// If we get a 401 or 403, try to refresh the token and retry
	if (
		(response.status === 401 || response.status === 403) &&
		retryOnAuthError
	) {
		const refreshed = await tryRefreshSession()
		if (refreshed) {
			// Retry the request with the new token
			return request(path, init, false)
		}
		// Refresh failed - only redirect if we have no token at all
		// This allows the app to continue working during temporary network issues
		const currentToken = getStoredToken()
		if (
			!currentToken &&
			typeof window !== "undefined" &&
			!path.includes("/auth/")
		) {
			// No token available - user needs to login
			window.location.href = "/login"
		}
	}

	if (!response.ok) {
		let message = "Request failed"
		try {
			const body = await response.json()
			message = body?.error?.message ?? message
		} catch {
			// ignore
		}
		throw new Error(message)
	}

	if (response.status === 204) return null

	const text = await response.text()
	return text ? JSON.parse(text) : null
}

type AuthResponse = {
	ok: boolean
	session?: {
		access_token: string
		refresh_token: string
		expires_at?: number
	}
	user?: {
		id: string
		email: string
	}
}

export async function signUp(input: {
	email: string
	password: string
	name?: string
}) {
	const response = (await request("/api/auth/sign-up", {
		method: "POST",
		body: JSON.stringify(input),
	})) as AuthResponse

	// Store tokens from Supabase Auth response
	if (response?.session?.access_token) {
		storeTokens(response.session.access_token, response.session.refresh_token)
	}

	await mutateSession()
}

export async function signIn(input: { email: string; password: string }) {
	const response = (await request("/api/auth/sign-in", {
		method: "POST",
		body: JSON.stringify(input),
	})) as AuthResponse

	// Store tokens from Supabase Auth response
	if (response?.session?.access_token) {
		storeTokens(response.session.access_token, response.session.refresh_token)
	}

	await mutateSession()
}

export async function signOut() {
	await request("/api/auth/sign-out", { method: "POST" })
	clearTokens()
	await mutateSession()
}

export async function getSession() {
	return request("/api/auth/session")
}

export async function requestPasswordReset(email: string) {
	await request("/api/auth/password/reset/request", {
		method: "POST",
		body: JSON.stringify({ email }),
	})
}

export async function completePasswordReset(input: {
	token: string
	password: string
}) {
	await request("/api/auth/password/reset/complete", {
		method: "POST",
		body: JSON.stringify(input),
	})
}

export async function updatePassword(input: {
	currentPassword: string
	newPassword: string
}) {
	await request("/api/auth/password/update", {
		method: "POST",
		body: JSON.stringify(input),
	})
}

const sessionKey = "auth-session"

function mutateSession() {
	return mutate(sessionKey)
}

type SessionResponse = {
	session: {
		token: string
		expiresAt: string
		organizationId: string
	} | null
	user?: {
		id: string
		email: string
		name: string | null
		createdAt?: string
		updatedAt?: string
	}
	organization?: {
		id: string
		slug: string
		name: string
	}
} | null

export function useSession() {
	const swr = useSWR<SessionResponse>(sessionKey, async () => {
		try {
			const data = await getSession()
			return data
		} catch {
			return { session: null }
		}
	})

	return swr
}

export const authClient = {
	signIn: {
		email: signIn,
		anonymous: async () => {
			const email = "anonymous@local.host"
			const password = "anonymous"
			try {
				await signIn({ email, password })
			} catch {
				await signUp({ email, password, name: "Anonymous" })
			}
		},
	},
	signUp,
	signOut,
	getSession,
	organization: {
		async list() {
			const data = await getSession()
			if (data?.organization) {
				return [data.organization]
			}
			return []
		},
		async setActive() {
			const data = await getSession()
			return data?.organization ?? null
		},
		async getFullOrganization() {
			const data = await getSession()
			return data?.organization ?? null
		},
	},
	apiKey: {
		async create(input: {
			name: string
			prefix?: string
			metadata?: Record<string, unknown>
		}) {
			const response = await request("/api/auth/api-keys", {
				method: "POST",
				body: JSON.stringify(input),
			})
			return response as {
				key: string
				apiKey: {
					id: string
					name: string
					createdAt: string
					lastUsedAt: string | null
					tokenHint: string
				}
			}
		},
	},
	password: {
		requestReset: requestPasswordReset,
		completeReset: completePasswordReset,
		update: updatePassword,
	},
}
