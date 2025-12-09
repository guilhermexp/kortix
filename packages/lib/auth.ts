"use client"

import useSWR, { mutate } from "swr"

import { BACKEND_URL } from "./env"

const API_BASE = BACKEND_URL
const AUTH_TOKEN_KEY = "kortix_auth_token"
const AUTH_REFRESH_KEY = "kortix_refresh_token"

// Store tokens in localStorage for persistence
function storeTokens(accessToken: string, refreshToken?: string) {
	if (typeof window !== "undefined") {
		localStorage.setItem(AUTH_TOKEN_KEY, accessToken)
		if (refreshToken) {
			localStorage.setItem(AUTH_REFRESH_KEY, refreshToken)
		}
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

async function request(path: string, init: RequestInit = {}) {
	const token = getStoredToken()
	const headers: Record<string, string> = {
		"Content-Type": "application/json",
		...(init.headers as Record<string, string> ?? {}),
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
	const response = await request("/api/auth/sign-up", {
		method: "POST",
		body: JSON.stringify(input),
	}) as AuthResponse

	// Store tokens from Supabase Auth response
	if (response?.session?.access_token) {
		storeTokens(response.session.access_token, response.session.refresh_token)
	}

	await mutateSession()
}

export async function signIn(input: { email: string; password: string }) {
	const response = await request("/api/auth/sign-in", {
		method: "POST",
		body: JSON.stringify(input),
	}) as AuthResponse

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
