/**
 * NotebookLM Client — Main entry point
 * Provides typed access to all NotebookLM APIs via reverse-engineered RPCs.
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import { ArtifactsAPI } from "./api/artifacts"
import { ChatAPI } from "./api/chat"
import { NotebooksAPI } from "./api/notebooks"
import { SourcesAPI } from "./api/sources"
import {
	type AuthTokens,
	type StoredCookies,
	buildAuthTokens,
	parsePlaywrightCookies,
	parseRawCookies,
	refreshAuthTokens,
} from "./auth"
import {
	buildBatchexecuteUrl,
	buildRequestBody,
	decodeResponse,
	encodeRpcRequest,
} from "./rpc"
import {
	AuthError,
	QUERY_URL,
	type RPCMethodValue,
	RPCError,
	RateLimitError,
} from "./types"

const DEFAULT_TIMEOUT = 60_000

// Default bl value (frontend build label) — may need updating periodically
const DEFAULT_BL = "boq_labs-tailwind-frontend_20260301.03_p0"

export class NotebookLMClient {
	private auth: AuthTokens
	private refreshPromise: Promise<AuthTokens> | null = null
	private requestCounter = 0

	// API sub-clients
	readonly notebooks: NotebooksAPI
	readonly sources: SourcesAPI
	readonly artifacts: ArtifactsAPI
	readonly chat: ChatAPI

	constructor(auth: AuthTokens) {
		this.auth = auth
		this.notebooks = new NotebooksAPI(this)
		this.sources = new SourcesAPI(this)
		this.artifacts = new ArtifactsAPI(this)
		this.chat = new ChatAPI(this)
	}

	// ─── Factory Methods ───────────────────────────────────────

	/**
	 * Create client from Playwright storage_state.json format.
	 * This is what you get after `notebooklm login`.
	 */
	static async fromStorageState(storageState: {
		cookies: Array<{ name: string; value: string; domain: string }>
	}): Promise<NotebookLMClient> {
		const cookies = parsePlaywrightCookies(storageState)
		const auth = await buildAuthTokens(cookies)
		return new NotebookLMClient(auth)
	}

	/**
	 * Create client from raw cookie string (document.cookie format).
	 * Use this when capturing cookies from browser extension popup.
	 */
	static async fromCookieString(
		cookieString: string,
	): Promise<NotebookLMClient> {
		const cookies = parseRawCookies(cookieString)
		const auth = await buildAuthTokens(cookies)
		return new NotebookLMClient(auth)
	}

	/**
	 * Create client from stored connection in Supabase.
	 * Loads encrypted cookies from the connections table.
	 */
	static async fromConnection(
		supabase: SupabaseClient,
		organizationId: string,
	): Promise<NotebookLMClient | null> {
		const { data: connection, error } = await supabase
			.from("connections")
			.select("metadata")
			.eq("org_id", organizationId)
			.eq("provider", "notebooklm")
			.maybeSingle()

		if (error) {
			console.error("[NotebookLM] Failed to fetch connection:", error.message)
			return null
		}

		if (!connection?.metadata) return null

		const meta = connection.metadata as Record<string, unknown>
		const cookieString = meta.cookieHeader as string | undefined
		if (!cookieString) return null

		const cookies: StoredCookies = {
			cookieHeader: cookieString,
			cookies: (meta.cookies as Record<string, string>) ?? {},
		}

		const auth = await buildAuthTokens(cookies)
		return new NotebookLMClient(auth)
	}

	// ─── RPC Transport ─────────────────────────────────────────

	/**
	 * Execute an RPC call against the batchexecute endpoint.
	 * Handles encoding, HTTP, decoding, auth refresh on failure.
	 */
	async rpcCall(
		method: RPCMethodValue,
		params: unknown[],
		sourcePath: string | null = null,
		isRetry = false,
	): Promise<unknown> {
		const encoded = encodeRpcRequest(method, params)
		const body = buildRequestBody(encoded, this.auth.csrfToken)
		const url = buildBatchexecuteUrl(method, sourcePath, this.auth.sessionId)

		const controller = new AbortController()
		const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT)

		try {
			const response = await fetch(url, {
				method: "POST",
				headers: {
					"Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
					Cookie: this.auth.cookies.cookieHeader,
					"User-Agent":
						"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
					Origin: "https://notebooklm.google.com",
					Referer: "https://notebooklm.google.com/",
				},
				body,
				signal: controller.signal,
			})

			if (response.status === 429) {
				throw new RateLimitError("Rate limited by NotebookLM")
			}
			if (response.status >= 500) {
				throw new RPCError(
					`Server error: HTTP ${response.status}`,
					response.status,
				)
			}
			if (response.status === 401 || response.status === 403) {
				if (!isRetry) {
					await this.refreshAuth()
					return this.rpcCall(method, params, sourcePath, true)
				}
				throw new AuthError(`Authentication failed: HTTP ${response.status}`)
			}

			const text = await response.text()
			return decodeResponse(text, method)
		} catch (error) {
			if (error instanceof AuthError && !isRetry) {
				await this.refreshAuth()
				return this.rpcCall(method, params, sourcePath, true)
			}
			throw error
		} finally {
			clearTimeout(timeout)
		}
	}

	/**
	 * Execute a streaming chat request against the GenerateFreeFormStreamed endpoint.
	 */
	async chatRequest(
		notebookId: string,
		question: string,
		sourceIds: string[],
		conversationHistory: unknown[] = [],
		conversationId: string | null = null,
		isRetry = false,
	): Promise<string> {
		this.requestCounter += 100000

		const sourcesArray = sourceIds.map((id) => [[id]])
		const params = [
			sourcesArray,
			question,
			conversationHistory,
			[2, null, [1], [1]],
			conversationId,
			null,
			null,
			notebookId,
			1,
		]
		const fReq = [null, JSON.stringify(params)]
		const body = `f.req=${encodeURIComponent(JSON.stringify(fReq))}&at=${encodeURIComponent(this.auth.csrfToken)}&`

		const bl = process.env.NOTEBOOKLM_BL ?? DEFAULT_BL
		const urlParams = new URLSearchParams({
			bl,
			hl: "en",
			_reqid: String(this.requestCounter),
			"f.sid": this.auth.sessionId,
			rt: "c",
		})

		const controller = new AbortController()
		const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT)

		try {
			const response = await fetch(`${QUERY_URL}?${urlParams.toString()}`, {
				method: "POST",
				headers: {
					"Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
					Cookie: this.auth.cookies.cookieHeader,
					"User-Agent":
						"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
					Origin: "https://notebooklm.google.com",
					Referer: "https://notebooklm.google.com/",
				},
				body,
				signal: controller.signal,
			})

			if (!response.ok) {
				if (response.status === 401 || response.status === 403) {
					if (!isRetry) {
						await this.refreshAuth()
						return this.chatRequest(
							notebookId,
							question,
							sourceIds,
							conversationHistory,
							conversationId,
							true,
						)
					}
					throw new AuthError("Chat authentication failed")
				}
				throw new RPCError(
					`Chat request failed: HTTP ${response.status}`,
					response.status,
				)
			}

			return await response.text()
		} finally {
			clearTimeout(timeout)
		}
	}

	// ─── Helper: Get Source IDs for a Notebook ─────────────────

	/**
	 * Fetch all source IDs for a notebook.
	 * Used by artifacts/chat when no specific sources are given.
	 */
	async getSourceIds(notebookId: string): Promise<string[]> {
		const sources = await this.sources.list(notebookId)
		return sources.map((s) => s.id)
	}

	// ─── Auth Management ───────────────────────────────────────

	/**
	 * Refresh auth tokens. Deduplicates concurrent refresh calls.
	 */
	private async refreshAuth(): Promise<void> {
		if (!this.refreshPromise) {
			this.refreshPromise = refreshAuthTokens(this.auth)
			try {
				this.auth = await this.refreshPromise
			} finally {
				this.refreshPromise = null
			}
		} else {
			this.auth = await this.refreshPromise
		}
	}

	/**
	 * Get current auth state (for persisting back to DB after refresh).
	 */
	getAuthState(): {
		cookieHeader: string
		cookies: Record<string, string>
		csrfToken: string
		sessionId: string
	} {
		return {
			cookieHeader: this.auth.cookies.cookieHeader,
			cookies: this.auth.cookies.cookies,
			csrfToken: this.auth.csrfToken,
			sessionId: this.auth.sessionId,
		}
	}
}
