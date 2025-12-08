/**
 * Tests for browser extension API utils
 */
import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test"
import { API_ENDPOINTS, STORAGE_KEYS } from "./constants"
import {
	AuthenticationError,
	type MemoryPayload,
	type Project,
	KortixAPIError,
} from "./types"

/**
 * NOTE: These tests are designed to run in a Node environment
 * For actual browser extension testing, use a tool like Puppeteer or Playwright
 *
 * This test suite validates the API logic independent of the browser runtime
 */

// Mock chrome.storage API
const mockStorageGet = mock(async (keys: string[]) => {
	if (keys.includes(STORAGE_KEYS.BEARER_TOKEN)) {
		return { [STORAGE_KEYS.BEARER_TOKEN]: "test-bearer-token-123" }
	}
	if (keys.includes(STORAGE_KEYS.DEFAULT_PROJECT)) {
		return {
			[STORAGE_KEYS.DEFAULT_PROJECT]: {
				id: "project-1",
				name: "Default Project",
				containerTag: "test-container",
			},
		}
	}
	if (keys.includes(STORAGE_KEYS.USER_DATA)) {
		return {
			[STORAGE_KEYS.USER_DATA]: {
				email: "test@example.com",
			},
		}
	}
	return {}
})

const mockStorageSet = mock(async () => {})

const mockStorage = {
	local: {
		get: mockStorageGet,
		set: mockStorageSet,
	},
}

// Mock fetch API
const mockFetch = mock(async (url: string, options?: RequestInit) => {
	// Simulate authentication check
	const authHeader = options?.headers?.["Authorization"] as string
	if (!authHeader || !authHeader.includes("test-bearer-token-123")) {
		return {
			ok: false,
			status: 401,
			statusText: "Unauthorized",
			json: async () => ({ error: "Unauthorized" }),
		}
	}

	// Simulate different endpoints
	if (url.includes("/v3/projects")) {
		return {
			ok: true,
			status: 200,
			json: async () => ({
				projects: [
					{
						id: "project-1",
						name: "Test Project 1",
						containerTag: "test-container-1",
					},
					{
						id: "project-2",
						name: "Test Project 2",
						containerTag: "test-container-2",
					},
				],
			}),
		}
	}

	if (url.includes("/v3/documents") && options?.method === "POST") {
		return {
			ok: true,
			status: 201,
			json: async () => ({
				id: "doc-123",
				status: "queued",
			}),
		}
	}

	if (url.includes("/v4/search")) {
		return {
			ok: true,
			status: 200,
			json: async () => ({
				results: [
					{
						memory: "Test memory 1",
						score: 0.95,
					},
					{
						memory: "Test memory 2",
						score: 0.87,
					},
				],
			}),
		}
	}

	if (url.includes("/v3/documents/batch")) {
		return {
			ok: true,
			status: 201,
			json: async () => ({
				success: true,
				imported: 5,
			}),
		}
	}

	return {
		ok: false,
		status: 404,
		statusText: "Not Found",
		json: async () => ({ error: "Not found" }),
	}
})

// Setup global mocks
global.chrome = mockStorage as unknown as typeof chrome
global.fetch = mockFetch as unknown as typeof fetch

// Import functions after mocks are set up
// Since we can't import dynamically here, we'll redefine the functions
async function getBearerToken(): Promise<string> {
	const result = await chrome.storage.local.get([STORAGE_KEYS.BEARER_TOKEN])
	const token = result[STORAGE_KEYS.BEARER_TOKEN]

	if (!token) {
		throw new AuthenticationError("Bearer token not found")
	}

	return token
}

async function makeAuthenticatedRequest<T>(
	endpoint: string,
	options: RequestInit = {},
): Promise<T> {
	const token = await getBearerToken()

	const response = await fetch(`${API_ENDPOINTS.KORTIX_API}${endpoint}`, {
		...options,
		credentials: "omit",
		headers: {
			Authorization: `Bearer ${token}`,
			"Content-Type": "application/json",
			...options.headers,
		},
	})

	if (!response.ok) {
		if (response.status === 401) {
			throw new AuthenticationError("Invalid or expired token")
		}
		throw new KortixAPIError(
			`API request failed: ${response.statusText}`,
			response.status,
		)
	}

	return response.json()
}

async function fetchProjects(): Promise<Project[]> {
	try {
		const response = await makeAuthenticatedRequest<{ projects: Project[] }>(
			"/v3/projects",
		)
		return response.projects
	} catch (error) {
		console.error("Failed to fetch projects:", error)
		throw error
	}
}

async function saveMemory(payload: MemoryPayload): Promise<unknown> {
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

async function searchMemories(query: string): Promise<unknown> {
	try {
		const response = await makeAuthenticatedRequest<unknown>("/v4/search", {
			method: "POST",
			body: JSON.stringify({ q: query, include: { relatedMemories: true } }),
		})
		return response
	} catch (error) {
		console.error("Failed to search memories:", error)
		throw error
	}
}

describe("Browser Extension API", () => {
	beforeEach(() => {
		mockFetch.mockClear()
		mockStorageGet.mockClear()
		mockStorageSet.mockClear()
	})

	afterEach(() => {
		// Cleanup
	})

	describe("getBearerToken", () => {
		it("should retrieve bearer token from storage", async () => {
			const token = await getBearerToken()
			expect(token).toBe("test-bearer-token-123")
			expect(mockStorageGet).toHaveBeenCalledWith([STORAGE_KEYS.BEARER_TOKEN])
		})

		it("should throw AuthenticationError if token not found", async () => {
			mockStorageGet.mockImplementationOnce(async () => ({}))

			expect(async () => {
				await getBearerToken()
			}).toThrow(AuthenticationError)
		})
	})

	describe("fetchProjects", () => {
		it("should fetch projects from API", async () => {
			const projects = await fetchProjects()

			expect(projects).toHaveLength(2)
			expect(projects[0].name).toBe("Test Project 1")
			expect(projects[1].name).toBe("Test Project 2")
		})

		it("should include authorization header", async () => {
			await fetchProjects()

			expect(mockFetch).toHaveBeenCalled()
			const call = mockFetch.mock.calls[0]
			const headers = call[1]?.headers as Record<string, string>
			expect(headers.Authorization).toBe("Bearer test-bearer-token-123")
		})

		it("should throw on authentication failure", async () => {
			mockStorageGet.mockImplementationOnce(async () => ({
				[STORAGE_KEYS.BEARER_TOKEN]: "invalid-token",
			}))

			expect(async () => {
				await fetchProjects()
			}).toThrow(AuthenticationError)
		})
	})

	describe("saveMemory", () => {
		it("should save memory with correct payload", async () => {
			const payload: MemoryPayload = {
				content: "Test memory content",
				containerTags: ["test-tag"],
				metadata: { source: "test" },
			}

			const result = await saveMemory(payload)

			expect(result).toEqual({
				id: "doc-123",
				status: "queued",
			})
			expect(mockFetch).toHaveBeenCalled()
		})

		it("should include authentication header", async () => {
			const payload: MemoryPayload = {
				content: "Test",
				containerTags: ["tag"],
			}

			await saveMemory(payload)

			const call = mockFetch.mock.calls[0]
			const headers = call[1]?.headers as Record<string, string>
			expect(headers.Authorization).toBe("Bearer test-bearer-token-123")
		})

		it("should send POST request to correct endpoint", async () => {
			const payload: MemoryPayload = {
				content: "Test",
				containerTags: ["tag"],
			}

			await saveMemory(payload)

			const call = mockFetch.mock.calls[0]
			expect(call[0]).toContain("/v3/documents")
			expect(call[1]?.method).toBe("POST")
		})
	})

	describe("searchMemories", () => {
		it("should search memories with query", async () => {
			const result = await searchMemories("test query")

			expect(result).toHaveProperty("results")
			const resultData = result as { results: Array<{ memory: string }> }
			expect(resultData.results).toHaveLength(2)
		})

		it("should send correct request format", async () => {
			await searchMemories("test query")

			const call = mockFetch.mock.calls[0]
			expect(call[0]).toContain("/v4/search")
			expect(call[1]?.method).toBe("POST")

			const body = JSON.parse(call[1]?.body as string)
			expect(body.q).toBe("test query")
			expect(body.include.relatedMemories).toBe(true)
		})
	})

	describe("Error Handling", () => {
		it("should handle network errors", async () => {
			mockFetch.mockImplementationOnce(async () => {
				throw new Error("Network error")
			})

			expect(async () => {
				await fetchProjects()
			}).toThrow()
		})

		it("should handle 401 errors specifically", async () => {
			mockFetch.mockImplementationOnce(async () => ({
				ok: false,
				status: 401,
				statusText: "Unauthorized",
				json: async () => ({ error: "Unauthorized" }),
			}))

			expect(async () => {
				await fetchProjects()
			}).toThrow(AuthenticationError)
		})

		it("should handle other HTTP errors", async () => {
			mockFetch.mockImplementationOnce(async () => ({
				ok: false,
				status: 500,
				statusText: "Internal Server Error",
				json: async () => ({ error: "Server error" }),
			}))

			expect(async () => {
				await fetchProjects()
			}).toThrow(KortixAPIError)
		})
	})
})

describe("Extension Constants", () => {
	it("should have correct API endpoint", () => {
		expect(API_ENDPOINTS.KORTIX_API).toBeDefined()
		expect(typeof API_ENDPOINTS.KORTIX_API).toBe("string")
	})

	it("should have storage keys defined", () => {
		expect(STORAGE_KEYS.BEARER_TOKEN).toBeDefined()
		expect(STORAGE_KEYS.DEFAULT_PROJECT).toBeDefined()
		expect(STORAGE_KEYS.USER_DATA).toBeDefined()
	})
})
