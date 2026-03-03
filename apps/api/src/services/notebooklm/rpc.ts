/**
 * NotebookLM RPC Layer — Encoder & Decoder
 * Handles Google batchexecute wire format encoding/decoding
 */

import {
	AuthError,
	BATCHEXECUTE_URL,
	type RPCMethodValue,
	RPCError,
	RateLimitError,
} from "./types"

// ─── Encoder ─────────────────────────────────────────────────

/**
 * Encode an RPC request into the batchexecute wire format.
 * Python equivalent: `encode_rpc_request` + `build_request_body`
 */
export function encodeRpcRequest(
	rpcId: RPCMethodValue,
	params: unknown[],
): string {
	const innerPayload = JSON.stringify(params)
	const envelope = [[[rpcId, innerPayload, null, "generic"]]]
	return JSON.stringify(envelope)
}

/**
 * Build the full POST body for a batchexecute call.
 */
export function buildRequestBody(
	rpcRequest: string,
	csrfToken: string,
): string {
	return `f.req=${encodeURIComponent(rpcRequest)}&at=${encodeURIComponent(csrfToken)}&`
}

/**
 * Build URL with query parameters for batchexecute.
 */
export function buildBatchexecuteUrl(
	rpcId: RPCMethodValue,
	sourcePath: string | null,
	sessionId: string,
): string {
	const params = new URLSearchParams({
		rpcids: rpcId,
		"f.sid": sessionId,
		hl: "en",
		"soc-app": "1",
		"soc-platform": "1",
		"soc-device": "1",
		_reqid: String(Math.floor(Math.random() * 900000) + 100000),
		rt: "c",
	})
	if (sourcePath) {
		params.set("source-path", sourcePath)
	}
	return `${BATCHEXECUTE_URL}?${params.toString()}`
}

// ─── Decoder ─────────────────────────────────────────────────

/**
 * Strip the anti-XSSI prefix `)]}'\n` from Google responses.
 */
function stripAntiXssi(response: string): string {
	const prefix = ")]}'\n"
	if (response.startsWith(prefix)) {
		return response.slice(prefix.length)
	}
	return response
}

/**
 * Parse the chunked response format.
 * Google uses alternating lines: byte_count\n json_payload\n
 */
function parseChunkedResponse(response: string): unknown[][] {
	const cleaned = stripAntiXssi(response)
	const chunks: unknown[][] = []
	const lines = cleaned.split("\n")

	let i = 0
	while (i < lines.length) {
		const line = lines[i].trim()
		if (!line) {
			i++
			continue
		}
		// Try to parse as a byte count (number line)
		const byteCount = Number.parseInt(line, 10)
		if (!Number.isNaN(byteCount) && i + 1 < lines.length) {
			// Next line(s) contain the JSON payload
			// Collect bytes from subsequent lines
			let payload = ""
			let remaining = byteCount
			i++
			while (remaining > 0 && i < lines.length) {
				const nextLine = lines[i]
				payload += nextLine + "\n"
				remaining -= new TextEncoder().encode(nextLine + "\n").length
				i++
			}
			payload = payload.trim()
			if (payload) {
				try {
					const parsed = JSON.parse(payload)
					if (Array.isArray(parsed)) {
						chunks.push(parsed)
					}
				} catch {
					// Not valid JSON, skip
				}
			}
		} else {
			// Try direct JSON parse
			try {
				const parsed = JSON.parse(line)
				if (Array.isArray(parsed)) {
					chunks.push(parsed)
				}
			} catch {
				// Skip non-JSON lines
			}
			i++
		}
	}

	return chunks
}

/**
 * Extract the RPC result from decoded chunks.
 * Looks for `wrb.fr` frames matching the rpcId.
 */
function extractRpcResult(
	chunks: unknown[][],
	rpcId: string,
): unknown | null {
	for (const chunk of chunks) {
		if (!Array.isArray(chunk)) continue
		for (const item of chunk) {
			if (!Array.isArray(item)) continue

			// Check for error frames
			if (item[0] === "er") {
				const errorData = item[1]
				if (Array.isArray(errorData)) {
					const errorCode = errorData[0]
					const errorMsg = errorData[1] ?? "Unknown RPC error"
					if (errorCode === 401 || errorCode === 403) {
						throw new AuthError(`Authentication failed: ${errorMsg}`)
					}
					throw new RPCError(`RPC error ${errorCode}: ${errorMsg}`, errorCode)
				}
			}

			// Look for wrb.fr frames
			if (item[0] === "wrb.fr" && item[1] === rpcId) {
				const jsonStr = item[2]
				if (typeof jsonStr === "string") {
					try {
						return JSON.parse(jsonStr)
					} catch {
						return jsonStr
					}
				}
				// Check for UserDisplayableError in index 5
				if (item[5] === "generic") {
					return null
				}
				return null
			}
		}
	}

	// Check for auth-related errors in raw chunks
	for (const chunk of chunks) {
		if (!Array.isArray(chunk)) continue
		const chunkStr = JSON.stringify(chunk)
		if (
			chunkStr.includes("UserDisplayableError") ||
			chunkStr.includes("NOT_LOGGED_IN")
		) {
			throw new AuthError("Session expired or not logged in")
		}
		if (chunkStr.includes("RATE_LIMIT") || chunkStr.includes("rate limit")) {
			throw new RateLimitError("Rate limited by NotebookLM")
		}
	}

	return null
}

/**
 * Full decode pipeline: strip prefix → parse chunks → extract result.
 */
export function decodeResponse(
	rawResponse: string,
	rpcId: string,
): unknown | null {
	const chunks = parseChunkedResponse(rawResponse)
	if (chunks.length === 0) {
		return null
	}
	return extractRpcResult(chunks, rpcId)
}

// ─── Chat Response Decoder ───────────────────────────────────

/**
 * Parse streaming chat response from GenerateFreeFormStreamed endpoint.
 * Different format from batchexecute — returns multiple JSON chunks.
 */
export function decodeChatResponse(rawResponse: string): {
	answer: string
	conversationId: string | null
	references: Array<{
		sourceId: string
		citedText: string
		startChar: number | null
		endChar: number | null
	}>
} {
	const chunks = parseChunkedResponse(rawResponse)

	let answer = ""
	let conversationId: string | null = null
	const references: Array<{
		sourceId: string
		citedText: string
		startChar: number | null
		endChar: number | null
	}> = []

	for (const chunk of chunks) {
		if (!Array.isArray(chunk)) continue
		for (const item of chunk) {
			if (!Array.isArray(item)) continue
			if (item[0] !== "wrb.fr") continue

			const jsonStr = item[2]
			if (typeof jsonStr !== "string") continue

			let innerData: unknown
			try {
				innerData = JSON.parse(jsonStr)
			} catch {
				continue
			}

			if (!Array.isArray(innerData)) continue

			// Extract answer text
			const first = innerData[0]
			if (Array.isArray(first) && typeof first[0] === "string") {
				// Check if this is the definitive answer (marked at first[4][-1] === 1)
				const isDefinitive =
					Array.isArray(first[4]) &&
					first[4][first[4].length - 1] === 1
				if (isDefinitive || !answer) {
					answer = first[0]
				}

				// Extract conversation ID
				if (Array.isArray(first[3]) && typeof first[3][0] === "string") {
					conversationId = first[3][0]
				}

				// Extract citations from first[4][3]
				if (Array.isArray(first[4]) && Array.isArray(first[4][3])) {
					for (const cite of first[4][3]) {
						if (!Array.isArray(cite) || !Array.isArray(cite[1])) continue
						try {
							// Source UUID is deeply nested
							const sourceId =
								cite[1]?.[5]?.[0]?.[0]?.[0] ??
								cite[1]?.[5]?.[0]?.[0] ??
								""
							const passages = cite[1]?.[4]
							if (Array.isArray(passages)) {
								for (const passage of passages) {
									if (!Array.isArray(passage)) continue
									references.push({
										sourceId: String(sourceId),
										citedText: String(passage[0] ?? ""),
										startChar:
											typeof passage[1] === "number" ? passage[1] : null,
										endChar:
											typeof passage[2] === "number" ? passage[2] : null,
									})
								}
							}
						} catch {
							// Malformed citation, skip
						}
					}
				}
			}
		}
	}

	return { answer, conversationId, references }
}
