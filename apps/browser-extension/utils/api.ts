/**
 * API service for Kortix browser extension
 */
import { API_ENDPOINTS, STORAGE_KEYS } from "./constants"
import {
	AuthenticationError,
	type BatchDocumentsResponse,
	KortixAPIError,
	type MemoryPayload,
	type Project,
	type ProjectsResponse,
} from "./types"

/**
 * Get bearer token from storage
 */
async function getBearerToken(): Promise<string> {
	const result = await chrome.storage.local.get([STORAGE_KEYS.BEARER_TOKEN])
	const token = result[STORAGE_KEYS.BEARER_TOKEN] as string | undefined

	if (!token) {
		throw new AuthenticationError("Bearer token not found")
	}

	return token
}

/**
 * Try to refresh the access token using the refresh token
 */
async function tryRefreshToken(): Promise<string | null> {
	try {
		const result = await chrome.storage.local.get([STORAGE_KEYS.REFRESH_TOKEN])
		const refreshToken = result[STORAGE_KEYS.REFRESH_TOKEN]
		if (!refreshToken) return null

		const response = await fetch(
			`${API_ENDPOINTS.KORTIX_API}/api/auth/refresh`,
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ refresh_token: refreshToken }),
			},
		)

		if (!response.ok) return null

		const data = await response.json()
		if (data.session?.access_token) {
			await chrome.storage.local.set({
				[STORAGE_KEYS.BEARER_TOKEN]: data.session.access_token,
				...(data.session.refresh_token && {
					[STORAGE_KEYS.REFRESH_TOKEN]: data.session.refresh_token,
				}),
			})
			return data.session.access_token
		}
		return null
	} catch {
		return null
	}
}

/**
 * Make authenticated API request with automatic token refresh on 401
 */
export async function makeAuthenticatedRequest<T>(
	endpoint: string,
	options: RequestInit = {},
): Promise<T> {
	const token = await getBearerToken()

	const doRequest = async (accessToken: string) => {
		return fetch(`${API_ENDPOINTS.KORTIX_API}${endpoint}`, {
			...options,
			credentials: "omit",
			headers: {
				Authorization: `Bearer ${accessToken}`,
				"Content-Type": "application/json",
				...options.headers,
			},
		})
	}

	let response = await doRequest(token)

	// On 401, attempt token refresh and retry once
	if (response.status === 401) {
		const newToken = await tryRefreshToken()
		if (newToken) {
			response = await doRequest(newToken)
		}
	}

	if (!response.ok) {
		if (response.status === 401) {
			// Clear invalid tokens
			await chrome.storage.local.remove([
				STORAGE_KEYS.BEARER_TOKEN,
				STORAGE_KEYS.REFRESH_TOKEN,
			])
			throw new AuthenticationError("Invalid or expired token")
		}
		throw new KortixAPIError(
			`API request failed: ${response.statusText}`,
			response.status,
		)
	}

	return response.json()
}

/**
 * Fetch all projects from API
 */
export async function fetchProjects(): Promise<Project[]> {
	try {
		const response =
			await makeAuthenticatedRequest<ProjectsResponse>("/v3/projects")
		return response.projects
	} catch (error) {
		console.error("Failed to fetch projects:", error)
		throw error
	}
}

/**
 * Get default project from storage
 */
export async function getDefaultProject(): Promise<Project | null> {
	try {
		const result = await chrome.storage.local.get([
			STORAGE_KEYS.DEFAULT_PROJECT,
		])
		const defaultProject = result[STORAGE_KEYS.DEFAULT_PROJECT] as
			| Project
			| undefined
		return defaultProject ?? null
	} catch (error) {
		console.error("Failed to get default project:", error)
		return null
	}
}

/**
 * Set default project in storage
 */
export async function setDefaultProject(project: Project): Promise<void> {
	try {
		await chrome.storage.local.set({
			[STORAGE_KEYS.DEFAULT_PROJECT]: project,
		})
	} catch (error) {
		console.error("Failed to set default project:", error)
		throw error
	}
}

/**
 * Validate if current bearer token is still valid
 */
export async function validateAuthToken(): Promise<boolean> {
	try {
		await makeAuthenticatedRequest<ProjectsResponse>("/v3/projects")
		return true
	} catch (error) {
		if (error instanceof AuthenticationError) {
			return false
		}
		console.error("Failed to validate auth token:", error)
		return true
	}
}

/**
 * Get user data from storage
 */
export async function getUserData(): Promise<{ email?: string } | null> {
	try {
		const result = await chrome.storage.local.get([STORAGE_KEYS.USER_DATA])
		return result[STORAGE_KEYS.USER_DATA] || null
	} catch (error) {
		console.error("Failed to get user data:", error)
		return null
	}
}

/**
 * Save memory to Kortix API
 */
export async function saveMemory(payload: MemoryPayload): Promise<unknown> {
	try {
		const response = await makeAuthenticatedRequest<unknown>("/v3/documents", {
			method: "POST",
			body: JSON.stringify(payload),
		})
		return response
	} catch (error) {
		console.error("Failed to save memory:", error)
		throw error
	}
}

/**
 * Search memories using Kortix API
 */
export async function searchMemories(query: string): Promise<unknown> {
	try {
		const response = await makeAuthenticatedRequest<unknown>("/v3/search", {
			method: "POST",
			body: JSON.stringify({ q: query }),
		})
		return response
	} catch (error) {
		console.error("Failed to search memories:", error)
		throw error
	}
}

/**
 * Save tweets to Kortix API in batch (specific for Twitter imports)
 */
export async function saveAllTweets(
	documents: MemoryPayload[],
): Promise<BatchDocumentsResponse> {
	const response = await makeAuthenticatedRequest<BatchDocumentsResponse>(
		"/v3/documents/batch",
		{
			method: "POST",
			body: JSON.stringify({
				documents,
				metadata: {
					sm_source: "consumer",
					sm_internal_group_id: "twitter_bookmarks",
				},
			}),
		},
	)
	return response
}
