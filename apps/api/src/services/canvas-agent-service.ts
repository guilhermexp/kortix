import { randomUUID } from "node:crypto"
import type { SupabaseClient } from "@supabase/supabase-js"
import {
	CanvasCreateViewResultSchema,
	CanvasToolModeSchema,
} from "@repo/validation/api"
import { z } from "zod"
import { emitCanvasElementsChanged } from "../socket/canvas-collaboration"

type CanvasToolMode = z.infer<typeof CanvasToolModeSchema>

type SceneElement = Record<string, unknown> & {
	id?: string
	type?: string
	containerId?: string
}

type CameraUpdate = {
	x?: number
	y?: number
	width?: number
	height?: number
}

type CanvasDocument = {
	elements: SceneElement[]
	appState?: Record<string, unknown>
	files?: Record<string, unknown>
}

type ElementBounds = {
	x: number
	y: number
	width: number
	height: number
}

type DiagramMode = "append" | "replace"

export const CANVAS_READ_ME_TEXT = `Canvas Tooling (Kortix)

Recommended workflow:
1) Use canvas_read_scene first to inspect current elements, bounds, and text labels
2) Use canvas_list_checkpoints before large edits (optional but recommended)
3) Use canvas_create_view for precise drawing/editing operations
4) Use canvas_auto_arrange when the user asks to organize a messy canvas
5) For high-level creation, prefer canvas_create_mindmap / canvas_create_flowchart
6) Use canvas_get_preview when you need visual inspection (layout/spacing/visual clutter)
7) Use canvas_read_scene or canvas_summarize_scene again to verify and summarize changes

Use canvas_create_view with an array JSON string.
Supported pseudo-elements:
- {"type":"cameraUpdate","x":0,"y":0,"width":800,"height":600}
- {"type":"restoreCheckpoint","id":"<checkpoint-id>"} (must be first when used)
- {"type":"delete","ids":"id1,id2"} or {"type":"delete","ids":["id1","id2"]}

All regular Excalidraw elements are accepted (rectangle, ellipse, diamond, text, arrow...).
Required for drawable elements: type + id + coordinates/sizing.
Tips:
- Prefer label on shapes for centered text.
- Keep minimum fontSize 14.
- Use cameraUpdate generously for readability.
- Never reuse deleted ids.
- For "what is on this canvas?" or "summarize the canvas", call canvas_read_scene and summarize from the returned stats/text/elements.
- You can also call canvas_summarize_scene for a ready-to-use structured summary.
- For "organize/clean up this canvas", call canvas_read_scene, then canvas_auto_arrange, then canvas_read_scene again to confirm the new layout.
- For "create a mindmap" prefer canvas_create_mindmap.
- For "create a process/flow diagram" prefer canvas_create_flowchart.
- For "look at the canvas" / "take a screenshot" / "inspect visually", call canvas_get_preview first (then combine with canvas_read_scene if needed).
- For "delete everything" / "clear the canvas" / "reset" / "apaga tudo", use canvas_clear. It removes ALL elements in one call.
`

function parseCanvasDocument(raw: unknown): CanvasDocument {
	if (!raw) {
		return { elements: [] }
	}
	let value: unknown = raw
	if (typeof raw === "string") {
		try {
			value = JSON.parse(raw)
		} catch {
			return { elements: [] }
		}
	}
	if (!value || typeof value !== "object") {
		return { elements: [] }
	}
	const doc = value as Record<string, unknown>
	const elements = Array.isArray(doc.elements)
		? doc.elements.filter(
				(item): item is SceneElement =>
					Boolean(item) && typeof item === "object",
			)
		: []
	const appState =
		doc.appState && typeof doc.appState === "object"
			? (doc.appState as Record<string, unknown>)
			: undefined
	const files =
		doc.files && typeof doc.files === "object"
			? (doc.files as Record<string, unknown>)
			: undefined
	return { elements, appState, files }
}

function toFiniteNumber(value: unknown): number | null {
	return typeof value === "number" && Number.isFinite(value) ? value : null
}

function getElementBounds(element: SceneElement): ElementBounds | null {
	const x = toFiniteNumber(element.x)
	const y = toFiniteNumber(element.y)
	const width = toFiniteNumber(element.width)
	const height = toFiniteNumber(element.height)
	if (x === null || y === null) return null
	return {
		x,
		y,
		width: width ?? 0,
		height: height ?? 0,
	}
}

function extractElementText(element: SceneElement): string | undefined {
	if (typeof element.text === "string" && element.text.trim().length > 0) {
		return element.text.trim()
	}
	if (
		element.label &&
		typeof element.label === "object" &&
		typeof (element.label as Record<string, unknown>).text === "string"
	) {
		const value = (element.label as Record<string, unknown>).text as string
		if (value.trim().length > 0) return value.trim()
	}
	return undefined
}

function computeSceneBounds(elements: SceneElement[]) {
	let minX = Number.POSITIVE_INFINITY
	let minY = Number.POSITIVE_INFINITY
	let maxX = Number.NEGATIVE_INFINITY
	let maxY = Number.NEGATIVE_INFINITY

	for (const element of elements) {
		const bounds = getElementBounds(element)
		if (!bounds) continue
		minX = Math.min(minX, bounds.x)
		minY = Math.min(minY, bounds.y)
		maxX = Math.max(maxX, bounds.x + Math.max(0, bounds.width))
		maxY = Math.max(maxY, bounds.y + Math.max(0, bounds.height))
	}

	if (!Number.isFinite(minX) || !Number.isFinite(minY)) {
		return null
	}

	return {
		minX,
		minY,
		maxX,
		maxY,
		width: Math.max(0, maxX - minX),
		height: Math.max(0, maxY - minY),
	}
}

function makeElementId(prefix: string) {
	return `${prefix}_${randomUUID().slice(0, 8)}`
}

function makeBaseElement(type: string, overrides: Record<string, unknown>): Record<string, unknown> {
	return {
		id: makeElementId(type),
		type,
		x: 0,
		y: 0,
		width: 100,
		height: 100,
		angle: 0,
		strokeColor: "#cbd5e1",
		backgroundColor: "transparent",
		fillStyle: "solid",
		strokeWidth: 2,
		strokeStyle: "solid",
		roughness: 0,
		opacity: 100,
		groupIds: [],
		frameId: null,
		roundness: null,
		seed: Math.floor(Math.random() * 2_147_483_647),
		version: 1,
		versionNonce: Math.floor(Math.random() * 2_147_483_647),
		isDeleted: false,
		boundElements: null,
		updated: Date.now(),
		link: null,
		locked: false,
		...overrides,
	}
}

function makeRectangleElement({
	x,
	y,
	width,
	height,
	backgroundColor = "#1f2937",
	strokeColor = "#94a3b8",
}: {
	x: number
	y: number
	width: number
	height: number
	backgroundColor?: string
	strokeColor?: string
}) {
	return makeBaseElement("rectangle", {
		x,
		y,
		width,
		height,
		backgroundColor,
		strokeColor,
	})
}

function makeDiamondElement({
	x,
	y,
	width,
	height,
	backgroundColor = "#111827",
	strokeColor = "#94a3b8",
}: {
	x: number
	y: number
	width: number
	height: number
	backgroundColor?: string
	strokeColor?: string
}) {
	return makeBaseElement("diamond", {
		x,
		y,
		width,
		height,
		backgroundColor,
		strokeColor,
	})
}

function makeTextElement({
	x,
	y,
	text,
	fontSize = 20,
	width,
	height,
}: {
	x: number
	y: number
	text: string
	fontSize?: number
	width?: number
	height?: number
}) {
	const estimatedWidth =
		width ?? Math.max(80, Math.min(480, Math.round(text.length * (fontSize * 0.62))))
	const estimatedHeight = height ?? Math.max(28, Math.round(fontSize * 1.4))
	return makeBaseElement("text", {
		x,
		y,
		width: estimatedWidth,
		height: estimatedHeight,
		text,
		fontSize,
		fontFamily: 3,
		textAlign: "center",
		verticalAlign: "middle",
		containerId: null,
		originalText: text,
		lineHeight: 1.25,
		autoResize: true,
		backgroundColor: "transparent",
		strokeColor: "#e5e7eb",
	})
}

function makeArrowElement({
	x,
	y,
	dx,
	dy,
	strokeColor = "#64748b",
}: {
	x: number
	y: number
	dx: number
	dy: number
	strokeColor?: string
}) {
	return makeBaseElement("arrow", {
		x,
		y,
		width: Math.abs(dx),
		height: Math.abs(dy),
		strokeColor,
		backgroundColor: "transparent",
		points: [
			[0, 0],
			[dx, dy],
		],
		startBinding: null,
		endBinding: null,
		lastCommittedPoint: null,
		startArrowhead: null,
		endArrowhead: "arrow",
	})
}

function centerTextInBox({
	boxX,
	boxY,
	boxW,
	boxH,
	text,
	fontSize,
}: {
	boxX: number
	boxY: number
	boxW: number
	boxH: number
	text: string
	fontSize: number
}) {
	const estimatedW = Math.max(80, Math.min(boxW - 16, Math.round(text.length * (fontSize * 0.62))))
	const estimatedH = Math.max(24, Math.round(fontSize * 1.4))
	return {
		x: boxX + Math.max(8, (boxW - estimatedW) / 2),
		y: boxY + Math.max(8, (boxH - estimatedH) / 2),
		width: estimatedW,
		height: estimatedH,
	}
}

function normalizeBulletLines(texts: string[], max = 12) {
	return texts
		.map((t) => (typeof t === "string" ? t.trim() : ""))
		.filter((t) => t.length > 0)
		.slice(0, max)
}

function parseOperationList(input: string): Array<Record<string, unknown>> {
	const parsed = JSON.parse(input)
	if (!Array.isArray(parsed)) {
		throw new Error("canvas_create_view input must be a JSON array")
	}
	return parsed.filter(
		(item): item is Record<string, unknown> =>
			Boolean(item) && typeof item === "object",
	)
}

function normalizeDeleteIds(raw: unknown): string[] {
	if (typeof raw === "string") {
		return raw
			.split(",")
			.map((v) => v.trim())
			.filter((v) => v.length > 0)
	}
	if (Array.isArray(raw)) {
		return raw
			.filter((v): v is string => typeof v === "string")
			.map((v) => v.trim())
			.filter((v) => v.length > 0)
	}
	return []
}

async function loadCheckpointSnapshot({
	client,
	checkpointId,
	canvasId,
	userId,
}: {
	client: SupabaseClient
	checkpointId: string
	canvasId: string
	userId: string
}): Promise<CanvasDocument | null> {
	const { data, error } = await client
		.from("canvas_checkpoints")
		.select("snapshot_content")
		.eq("id", checkpointId)
		.eq("canvas_id", canvasId)
		.eq("user_id", userId)
		.maybeSingle()
	if (error) {
		throw error
	}
	if (!data || typeof data.snapshot_content !== "string") {
		return null
	}
	return parseCanvasDocument(data.snapshot_content)
}

async function insertCanvasOp({
	client,
	canvasId,
	userId,
	checkpointId,
	baseVersion,
	resultVersion,
	opsJson,
	status,
}: {
	client: SupabaseClient
	canvasId: string
	userId: string
	checkpointId?: string | null
	baseVersion?: number | null
	resultVersion?: number | null
	opsJson: string
	status: "applied" | "conflict" | "error"
}) {
	await client.from("canvas_ops").insert({
		canvas_id: canvasId,
		user_id: userId,
		checkpoint_id: checkpointId ?? null,
		base_version: baseVersion ?? null,
		result_version: resultVersion ?? null,
		ops_json: opsJson,
		status,
	})
}

export async function applyCanvasCreateView({
	client,
	userId,
	canvasId,
	input,
	checkpointId,
	mode = "append",
	baseVersion,
	source = "agent",
}: {
	client: SupabaseClient
	userId: string
	canvasId: string
	input: string
	checkpointId?: string
	mode?: CanvasToolMode
	baseVersion?: number
	source?: string
}) {
	let canvasVersionForError = 1
	try {
		const ops = parseOperationList(input)

		const { data: canvasRow, error: canvasError } = await client
			.from("canvases")
			.select("id, user_id, project_id, content, version")
			.eq("id", canvasId)
			.eq("user_id", userId)
			.single()

		if (canvasError || !canvasRow) {
			await insertCanvasOp({
				client,
				canvasId,
				userId,
				checkpointId: checkpointId ?? null,
				baseVersion: baseVersion ?? null,
				resultVersion: null,
				opsJson: input,
				status: "error",
			})
			return CanvasCreateViewResultSchema.parse({
				checkpointId: checkpointId ?? null,
				canvasId,
				appliedElementIds: [],
				deletedElementIds: [],
				conflictStatus: "stale_base",
				canvasVersion: 1,
				message: "Canvas not found or access denied",
			})
		}

		const currentVersion =
			typeof canvasRow.version === "number" && Number.isFinite(canvasRow.version)
				? canvasRow.version
				: 1
		canvasVersionForError = currentVersion

		if (typeof baseVersion === "number" && baseVersion !== currentVersion) {
			await insertCanvasOp({
				client,
				canvasId,
				userId,
				checkpointId: null,
				baseVersion,
				resultVersion: currentVersion,
				opsJson: input,
				status: "conflict",
			})
			return CanvasCreateViewResultSchema.parse({
				checkpointId: checkpointId ?? null,
				canvasId,
				appliedElementIds: [],
				deletedElementIds: [],
				conflictStatus: "stale_base",
				canvasVersion: currentVersion,
				message: `Canvas version conflict: expected ${baseVersion}, current ${currentVersion}`,
			})
		}

	let workingDoc: CanvasDocument
	let effectiveCheckpointId = checkpointId
	const firstOp = ops[0]
	const restoreFromOp =
		firstOp && firstOp.type === "restoreCheckpoint" && typeof firstOp.id === "string"
			? firstOp.id
			: undefined
	const restoreCheckpointId = restoreFromOp ?? checkpointId

		if (restoreCheckpointId) {
			const checkpointDoc = await loadCheckpointSnapshot({
				client,
				checkpointId: restoreCheckpointId,
				canvasId,
				userId,
			})
			if (!checkpointDoc) {
				await insertCanvasOp({
					client,
					canvasId,
					userId,
					checkpointId: restoreCheckpointId,
					baseVersion: currentVersion,
					resultVersion: currentVersion,
					opsJson: input,
					status: "error",
				})
				return CanvasCreateViewResultSchema.parse({
					checkpointId: checkpointId ?? null,
					canvasId,
					appliedElementIds: [],
					deletedElementIds: [],
					conflictStatus: "stale_base",
					canvasVersion: currentVersion,
					message: `Checkpoint not found: ${restoreCheckpointId}`,
				})
			}
			workingDoc = checkpointDoc
			effectiveCheckpointId = restoreCheckpointId
		} else if (mode === "replace") {
			workingDoc = { elements: [] }
		} else {
			workingDoc = parseCanvasDocument(canvasRow.content)
		}

	const currentElements = [...workingDoc.elements]
	const byId = new Map<string, SceneElement>()
	for (const element of currentElements) {
		if (typeof element.id === "string" && element.id.length > 0) {
			byId.set(element.id, element)
		}
	}

	const deletedIds = new Set<string>()
	const appliedElementIds: string[] = []
	let camera: CameraUpdate | undefined

	for (const op of ops) {
		const type = typeof op.type === "string" ? op.type : ""

		if (type === "restoreCheckpoint") {
			continue
		}

		if (type === "cameraUpdate") {
			camera = {
				x: typeof op.x === "number" ? op.x : undefined,
				y: typeof op.y === "number" ? op.y : undefined,
				width: typeof op.width === "number" ? op.width : undefined,
				height: typeof op.height === "number" ? op.height : undefined,
			}
			continue
		}

		if (type === "delete") {
			const ids = normalizeDeleteIds(op.ids)
			for (const id of ids) {
				deletedIds.add(id)
				byId.delete(id)
			}
			for (const [id, element] of byId.entries()) {
				if (
					typeof element.containerId === "string" &&
					deletedIds.has(element.containerId)
				) {
					deletedIds.add(id)
					byId.delete(id)
				}
			}
			continue
		}

		if (typeof op.id !== "string" || op.id.trim().length === 0) {
			continue
		}
		if (!type) {
			continue
		}
		const elementId = op.id.trim()
		byId.set(elementId, { ...op, id: elementId, type })
		appliedElementIds.push(elementId)
		deletedIds.delete(elementId)
	}

	const nextElements = Array.from(byId.values())
	const nextDoc: CanvasDocument = {
		elements: nextElements,
		appState: workingDoc.appState,
		files: workingDoc.files,
	}
	const nextVersion = currentVersion + 1
	const serialized = JSON.stringify(nextDoc)

	const { data: updatedRow, error: updateError } = await client
		.from("canvases")
		.update({
			content: serialized,
			version: nextVersion,
			updated_at: new Date().toISOString(),
		})
		.eq("id", canvasId)
		.eq("user_id", userId)
		.eq("version", currentVersion)
		.select("id, version")
		.single()

	if (updateError || !updatedRow) {
		const { data: latest } = await client
			.from("canvases")
			.select("version")
			.eq("id", canvasId)
			.eq("user_id", userId)
			.maybeSingle()
		const latestVersion =
			typeof latest?.version === "number" && Number.isFinite(latest.version)
				? latest.version
				: currentVersion
		await insertCanvasOp({
			client,
			canvasId,
			userId,
			checkpointId: null,
			baseVersion: currentVersion,
			resultVersion: latestVersion,
			opsJson: input,
			status: "conflict",
		})
		return CanvasCreateViewResultSchema.parse({
			checkpointId: checkpointId ?? null,
			canvasId,
			appliedElementIds: [],
			deletedElementIds: [],
			conflictStatus: "stale_base",
			canvasVersion: latestVersion,
			message: `Canvas version conflict: expected ${currentVersion}, current ${latestVersion}`,
		})
	}

		const { data: checkpointRow, error: checkpointError } = await client
			.from("canvas_checkpoints")
			.insert({
				canvas_id: canvasId,
				user_id: userId,
				project_id: canvasRow.project_id ?? null,
				snapshot_content: serialized,
				source,
			})
			.select("id")
			.single()
		if (checkpointError || !checkpointRow) {
			await insertCanvasOp({
				client,
				canvasId,
				userId,
				checkpointId: effectiveCheckpointId ?? null,
				baseVersion: currentVersion,
				resultVersion: nextVersion,
				opsJson: input,
				status: "error",
			})
			return CanvasCreateViewResultSchema.parse({
				checkpointId: effectiveCheckpointId ?? null,
				canvasId,
				appliedElementIds: [],
				deletedElementIds: [],
				conflictStatus: "stale_base",
				canvasVersion: currentVersion,
				message: "Failed to create canvas checkpoint",
			})
		}
	effectiveCheckpointId = checkpointRow.id

	await insertCanvasOp({
		client,
		canvasId,
		userId,
		checkpointId: effectiveCheckpointId,
		baseVersion: currentVersion,
		resultVersion: nextVersion,
		opsJson: input,
		status: "applied",
	})

	emitCanvasElementsChanged(canvasId, {
		elements: nextElements,
		version: nextVersion,
	})

		return CanvasCreateViewResultSchema.parse({
			checkpointId: effectiveCheckpointId,
			canvasId,
			appliedElementIds,
			deletedElementIds: Array.from(deletedIds),
			camera,
			conflictStatus: "none",
			canvasVersion: nextVersion,
			message:
				mode === "replace"
					? "Canvas replaced successfully"
					: "Canvas updated successfully",
		})
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown canvas error"
		await insertCanvasOp({
			client,
			canvasId,
			userId,
			checkpointId: checkpointId ?? null,
			baseVersion: baseVersion ?? null,
			resultVersion: canvasVersionForError,
			opsJson: input,
			status: "error",
		})
		return CanvasCreateViewResultSchema.parse({
			checkpointId: checkpointId ?? null,
			canvasId,
			appliedElementIds: [],
			deletedElementIds: [],
			conflictStatus: "stale_base",
			canvasVersion: canvasVersionForError,
			message: `canvas_create_view failed: ${message}`,
		})
	}
}

async function applyCanvasCreateViewWithRetry(
	params: Parameters<typeof applyCanvasCreateView>[0],
	options?: { maxAttempts?: number },
) {
	const maxAttempts = Math.max(1, options?.maxAttempts ?? 3)
	let attempt = 0
	let lastResult: Awaited<ReturnType<typeof applyCanvasCreateView>> | null = null

	while (attempt < maxAttempts) {
		attempt += 1
		const result = await applyCanvasCreateView(params)
		lastResult = result
		if (result.conflictStatus === "none") {
			return result
		}
	}

	return lastResult ?? (await applyCanvasCreateView(params))
}

export function resolveCanvasToolTarget({
	requestedCanvasId,
	contextCanvasId,
}: {
	requestedCanvasId?: string
	contextCanvasId?: string
}) {
	if (requestedCanvasId && requestedCanvasId.trim().length > 0) {
		return requestedCanvasId.trim()
	}
	if (contextCanvasId && contextCanvasId.trim().length > 0) {
		return contextCanvasId.trim()
	}
	return null
}

async function loadCanvasRowForTool({
	client,
	userId,
	canvasId,
}: {
	client: SupabaseClient
	userId: string
	canvasId: string
}) {
	const { data, error } = await client
		.from("canvases")
		.select("id, name, content, preview, version, updated_at")
		.eq("id", canvasId)
		.eq("user_id", userId)
		.single()

	if (error || !data) {
		throw new Error("Canvas not found or access denied")
	}

	return data
}

function parseDataUrlImage(
	value: unknown,
): { mimeType: string; dataBase64: string } | null {
	if (typeof value !== "string") return null
	const trimmed = value.trim()
	if (!trimmed.startsWith("data:")) return null
	const match = /^data:([^;,]+);base64,([A-Za-z0-9+/=]+)$/i.exec(trimmed)
	if (!match) return null
	const mimeType = match[1]?.trim().toLowerCase()
	const dataBase64 = match[2]?.trim()
	if (!mimeType || !dataBase64) return null
	return { mimeType, dataBase64 }
}

export async function getCanvasPreviewForAgent({
	client,
	userId,
	canvasId,
}: {
	client: SupabaseClient
	userId: string
	canvasId: string
}) {
	const canvasRow = await loadCanvasRowForTool({ client, userId, canvasId })
	const parsed = parseDataUrlImage((canvasRow as Record<string, unknown>).preview)
	const previewText =
		typeof (canvasRow as Record<string, unknown>).preview === "string"
			? ((canvasRow as Record<string, unknown>).preview as string)
			: null

	return {
		canvasId,
		name:
			typeof canvasRow.name === "string" && canvasRow.name.trim().length > 0
				? canvasRow.name
				: "Untitled Canvas",
		canvasVersion:
			typeof canvasRow.version === "number" && Number.isFinite(canvasRow.version)
				? canvasRow.version
				: 1,
		updatedAt:
			typeof canvasRow.updated_at === "string"
				? canvasRow.updated_at
				: new Date().toISOString(),
		hasPreview: Boolean(parsed),
		mimeType: parsed?.mimeType ?? null,
		dataBase64: parsed?.dataBase64 ?? null,
		previewLength: previewText?.length ?? 0,
	}
}

export async function readCanvasSceneForAgent({
	client,
	userId,
	canvasId,
	elementLimit = 200,
	includeRaw = false,
}: {
	client: SupabaseClient
	userId: string
	canvasId: string
	elementLimit?: number
	includeRaw?: boolean
}) {
	const canvasRow = await loadCanvasRowForTool({ client, userId, canvasId })
	const doc = parseCanvasDocument(canvasRow.content)
	const elements = Array.isArray(doc.elements) ? doc.elements : []
	const bounds = computeSceneBounds(elements)

	const byType: Record<string, number> = {}
	const textSnippets: string[] = []

	for (const element of elements) {
		const type =
			typeof element.type === "string" && element.type.trim().length > 0
				? element.type
				: "unknown"
		byType[type] = (byType[type] ?? 0) + 1
		const text = extractElementText(element)
		if (text && textSnippets.length < 40) {
			textSnippets.push(text.length > 220 ? `${text.slice(0, 217)}...` : text)
		}
	}

	const normalizedElements = elements.slice(0, Math.max(1, elementLimit)).map((el) => {
		const bounds = getElementBounds(el)
		return {
			id: typeof el.id === "string" ? el.id : undefined,
			type: typeof el.type === "string" ? el.type : "unknown",
			text: extractElementText(el),
			containerId:
				typeof el.containerId === "string" ? el.containerId : undefined,
			x: bounds?.x,
			y: bounds?.y,
			width: bounds?.width,
			height: bounds?.height,
			angle: toFiniteNumber(el.angle) ?? undefined,
		}
	})

	return {
		canvasId,
		name:
			typeof canvasRow.name === "string" && canvasRow.name.trim().length > 0
				? canvasRow.name
				: "Untitled Canvas",
		canvasVersion:
			typeof canvasRow.version === "number" && Number.isFinite(canvasRow.version)
				? canvasRow.version
				: 1,
		updatedAt:
			typeof canvasRow.updated_at === "string"
				? canvasRow.updated_at
				: new Date().toISOString(),
		stats: {
			totalElements: elements.length,
			countByType: byType,
			textElementCount:
				byType.text ?? 0,
			arrowElementCount:
				(byType.arrow ?? 0) + (byType.line ?? 0),
			hasFiles:
				Boolean(doc.files) &&
				typeof doc.files === "object" &&
				Object.keys(doc.files).length > 0,
		},
		bounds,
		textSnippets,
		elements: normalizedElements,
		...(includeRaw ? { raw: doc } : {}),
	}
}

export async function listCanvasCheckpointsForAgent({
	client,
	userId,
	canvasId,
	limit = 20,
}: {
	client: SupabaseClient
	userId: string
	canvasId: string
	limit?: number
}) {
	const cappedLimit = Math.min(100, Math.max(1, limit))
	const { data, error } = await client
		.from("canvas_checkpoints")
		.select("id, source, created_at")
		.eq("canvas_id", canvasId)
		.eq("user_id", userId)
		.order("created_at", { ascending: false })
		.limit(cappedLimit)

	if (error) throw error

	return {
		canvasId,
		checkpoints: Array.isArray(data)
			? data.map((row) => ({
					id: typeof row.id === "string" ? row.id : "",
					source:
						typeof row.source === "string" && row.source.trim().length > 0
							? row.source
							: "unknown",
					createdAt:
						typeof row.created_at === "string"
							? row.created_at
							: new Date().toISOString(),
				}))
			: [],
	}
}

function collectClusterElementIds(rootId: string, elements: SceneElement[]): string[] {
	const allById = new Map<string, SceneElement>()
	for (const el of elements) {
		if (typeof el.id === "string" && el.id.trim().length > 0) {
			allById.set(el.id, el)
		}
	}

	const result = new Set<string>([rootId])
	let changed = true
	while (changed) {
		changed = false
		for (const el of elements) {
			if (typeof el.id !== "string" || el.id.trim().length === 0) continue
			if (
				typeof el.containerId === "string" &&
				result.has(el.containerId) &&
				!result.has(el.id)
			) {
				result.add(el.id)
				changed = true
			}
		}
	}

	return [...result].filter((id) => allById.has(id))
}

export async function autoArrangeCanvasForAgent({
	client,
	userId,
	canvasId,
	columns = 3,
	gapX = 120,
	gapY = 100,
	padding = 80,
	baseVersion,
}: {
	client: SupabaseClient
	userId: string
	canvasId: string
	columns?: number
	gapX?: number
	gapY?: number
	padding?: number
	baseVersion?: number
}) {
	const snapshot = await readCanvasSceneForAgent({
		client,
		userId,
		canvasId,
		elementLimit: 1000,
		includeRaw: true,
	})
	const doc = snapshot.raw as CanvasDocument | undefined
	const elements = Array.isArray(doc?.elements) ? doc.elements : []

	const supportedRootTypes = new Set([
		"rectangle",
		"ellipse",
		"diamond",
		"text",
		"image",
		"frame",
		"embeddable",
	])
	const nonLayoutTypes = new Set(["arrow", "line", "freedraw", "draw"])

	const allById = new Map<string, SceneElement>()
	for (const el of elements) {
		if (typeof el.id === "string" && el.id.trim().length > 0) {
			allById.set(el.id, el)
		}
	}

	const rootCandidates = elements.filter((el) => {
		if (typeof el.id !== "string" || el.id.trim().length === 0) return false
		if (typeof el.containerId === "string" && el.containerId.trim().length > 0) {
			return false
		}
		const type = typeof el.type === "string" ? el.type : ""
		if (!type || nonLayoutTypes.has(type)) return false
		return supportedRootTypes.has(type) || Boolean(getElementBounds(el))
	})

	if (rootCandidates.length === 0) {
		return {
			canvasId,
			canvasVersion: snapshot.canvasVersion,
			message: "No layout-eligible elements found",
			movedClusters: 0,
			result: null,
		}
	}

	const clusterIdsList = rootCandidates.map((root) =>
		collectClusterElementIds(root.id as string, elements),
	)

	const clusters = clusterIdsList
		.map((ids, index) => {
			const clusterElements = ids
				.map((id) => allById.get(id))
				.filter((el): el is SceneElement => Boolean(el))
			const bounds = computeSceneBounds(clusterElements)
			const root = rootCandidates[index]
			if (!bounds || !root || typeof root.id !== "string") return null
			return {
				rootId: root.id,
				ids,
				elements: clusterElements,
				bounds,
				sortKeyY: bounds.minY,
				sortKeyX: bounds.minX,
			}
		})
		.filter(
			(item): item is NonNullable<typeof item> =>
				item !== null,
		)
		.sort((a, b) =>
			a.sortKeyY === b.sortKeyY ? a.sortKeyX - b.sortKeyX : a.sortKeyY - b.sortKeyY,
		)

	const colCount = Math.max(1, Math.min(12, Math.floor(columns || 3)))
	const safeGapX = Math.max(16, gapX)
	const safeGapY = Math.max(16, gapY)
	const safePadding = Math.max(0, padding)

	const rowHeights = new Map<number, number>()
	const colWidths = new Map<number, number>()
	for (let i = 0; i < clusters.length; i += 1) {
		const row = Math.floor(i / colCount)
		const col = i % colCount
		const width = Math.max(80, clusters[i]!.bounds.width)
		const height = Math.max(40, clusters[i]!.bounds.height)
		rowHeights.set(row, Math.max(rowHeights.get(row) ?? 0, height))
		colWidths.set(col, Math.max(colWidths.get(col) ?? 0, width))
	}

	const rowOffsets = new Map<number, number>()
	const colOffsets = new Map<number, number>()
	let runningY = safePadding
	for (let row = 0; row <= Math.floor((clusters.length - 1) / colCount); row += 1) {
		rowOffsets.set(row, runningY)
		runningY += (rowHeights.get(row) ?? 0) + safeGapY
	}
	let runningX = safePadding
	for (let col = 0; col < colCount; col += 1) {
		colOffsets.set(col, runningX)
		runningX += (colWidths.get(col) ?? 0) + safeGapX
	}

	const ops: Record<string, unknown>[] = []
	for (let i = 0; i < clusters.length; i += 1) {
		const cluster = clusters[i]!
		const row = Math.floor(i / colCount)
		const col = i % colCount
		const targetX = colOffsets.get(col) ?? safePadding
		const targetY = rowOffsets.get(row) ?? safePadding
		const dx = targetX - cluster.bounds.minX
		const dy = targetY - cluster.bounds.minY

		for (const element of cluster.elements) {
			const currentBounds = getElementBounds(element)
			if (!currentBounds || typeof element.id !== "string") continue
			ops.push({
				...element,
				id: element.id,
				type: typeof element.type === "string" ? element.type : "rectangle",
				x: currentBounds.x + dx,
				y: currentBounds.y + dy,
			})
		}
	}

	const finalBounds = {
		x: 0,
		y: 0,
		width: Math.max(800, runningX + safePadding),
		height: Math.max(600, runningY + safePadding),
	}
	ops.push({ type: "cameraUpdate", ...finalBounds })

	const result = await applyCanvasCreateViewWithRetry({
		client,
		userId,
		canvasId,
		input: JSON.stringify(ops),
		mode: "append",
		baseVersion,
		source: "agent:auto-arrange",
	})

	return {
		canvasId,
		canvasVersion: result.canvasVersion,
		movedClusters: clusters.length,
		columns: colCount,
		gapX: safeGapX,
		gapY: safeGapY,
		padding: safePadding,
		result,
	}
}

type MindmapBranchInput =
	| string
	| {
			label: string
			children?: string[]
	  }

function normalizeMindmapBranches(branches: MindmapBranchInput[]) {
	return branches
		.map((branch) => {
			if (typeof branch === "string") {
				const label = branch.trim()
				if (!label) return null
				return { label, children: [] as string[] }
			}
			if (!branch || typeof branch !== "object") return null
			const label = typeof branch.label === "string" ? branch.label.trim() : ""
			if (!label) return null
			const children = Array.isArray(branch.children)
				? normalizeBulletLines(branch.children, 8)
				: []
			return { label, children }
		})
		.filter((b): b is { label: string; children: string[] } => b !== null)
}

export async function createMindmapCanvasForAgent({
	client,
	userId,
	canvasId,
	center,
	branches,
	mode = "append",
	baseVersion,
}: {
	client: SupabaseClient
	userId: string
	canvasId: string
	center: string
	branches: MindmapBranchInput[]
	mode?: DiagramMode
	baseVersion?: number
}) {
	const centerLabel = center.trim()
	if (!centerLabel) {
		throw new Error("Mindmap center text is required")
	}
	const normalizedBranches = normalizeMindmapBranches(branches)
	if (normalizedBranches.length === 0) {
		throw new Error("Mindmap requires at least one branch")
	}

	const ops: Record<string, unknown>[] = []
	const centerW = 280
	const centerH = 90
	const cx = 760
	const cy = 520
	const centerX = cx - centerW / 2
	const centerY = cy - centerH / 2
	ops.push(
		makeRectangleElement({
			x: centerX,
			y: centerY,
			width: centerW,
			height: centerH,
			backgroundColor: "#0f172a",
			strokeColor: "#38bdf8",
		}),
	)
	const cText = centerTextInBox({
		boxX: centerX,
		boxY: centerY,
		boxW: centerW,
		boxH: centerH,
		text: centerLabel,
		fontSize: 24,
	})
	ops.push(
		makeTextElement({
			x: cText.x,
			y: cText.y,
			width: cText.width,
			height: cText.height,
			text: centerLabel,
			fontSize: 24,
		}),
	)

	const radiusX = 420
	const radiusY = 300
	const total = normalizedBranches.length
	normalizedBranches.forEach((branch, index) => {
		const angle = (-Math.PI / 2) + (2 * Math.PI * index) / total
		const bx = cx + Math.cos(angle) * radiusX
		const by = cy + Math.sin(angle) * radiusY
		const branchW = 240
		const branchH = 70
		const boxX = bx - branchW / 2
		const boxY = by - branchH / 2

		ops.push(
			makeArrowElement({
				x: cx,
				y: cy,
				dx: bx - cx,
				dy: by - cy,
				strokeColor: "#475569",
			}),
		)
		ops.push(
			makeRectangleElement({
				x: boxX,
				y: boxY,
				width: branchW,
				height: branchH,
				backgroundColor: "#111827",
				strokeColor: "#a78bfa",
			}),
		)
		const bText = centerTextInBox({
			boxX,
			boxY,
			boxW: branchW,
			boxH: branchH,
			text: branch.label,
			fontSize: 18,
		})
		ops.push(
			makeTextElement({
				x: bText.x,
				y: bText.y,
				width: bText.width,
				height: bText.height,
				text: branch.label,
				fontSize: 18,
			}),
		)

		if (branch.children.length > 0) {
			const side = Math.cos(angle) >= 0 ? 1 : -1
			const childW = 210
			const childH = 56
			const childGap = 18
			const startY = by - ((branch.children.length * (childH + childGap) - childGap) / 2)
			const childColumnX = side > 0 ? boxX + branchW + 140 : boxX - 140 - childW

			branch.children.forEach((child, childIndex) => {
				const childY = startY + childIndex * (childH + childGap)
				const anchorX = side > 0 ? boxX + branchW : boxX
				const anchorY = by
				const targetX = side > 0 ? childColumnX : childColumnX + childW
				const targetY = childY + childH / 2
				ops.push(
					makeArrowElement({
						x: anchorX,
						y: anchorY,
						dx: targetX - anchorX,
						dy: targetY - anchorY,
						strokeColor: "#64748b",
					}),
				)
				ops.push(
					makeRectangleElement({
						x: childColumnX,
						y: childY,
						width: childW,
						height: childH,
						backgroundColor: "#0b1220",
						strokeColor: "#94a3b8",
					}),
				)
				const childTextBox = centerTextInBox({
					boxX: childColumnX,
					boxY: childY,
					boxW: childW,
					boxH: childH,
					text: child,
					fontSize: 16,
				})
				ops.push(
					makeTextElement({
						x: childTextBox.x,
						y: childTextBox.y,
						width: childTextBox.width,
						height: childTextBox.height,
						text: child,
						fontSize: 16,
					}),
				)
			})
		}
	})

	ops.push({
		type: "cameraUpdate",
		x: 60,
		y: 120,
		width: 1400,
		height: 900,
	})

	const result = await applyCanvasCreateViewWithRetry({
		client,
		userId,
		canvasId,
		input: JSON.stringify(ops),
		mode,
		baseVersion,
		source: "agent:mindmap",
	})

	return {
		canvasId,
		center: centerLabel,
		branchCount: normalizedBranches.length,
		result,
	}
}

export async function createFlowchartCanvasForAgent({
	client,
	userId,
	canvasId,
	title,
	steps,
	mode = "append",
	baseVersion,
	direction = "vertical",
}: {
	client: SupabaseClient
	userId: string
	canvasId: string
	title?: string
	steps: string[]
	mode?: DiagramMode
	baseVersion?: number
	direction?: "vertical" | "horizontal"
}) {
	const normalizedSteps = normalizeBulletLines(steps, 20)
	if (normalizedSteps.length === 0) {
		throw new Error("Flowchart requires at least one step")
	}

	const ops: Record<string, unknown>[] = []
	const startX = 280
	const startY = 180
	const boxW = 300
	const boxH = 88
	const gap = 80
	const isVertical = direction !== "horizontal"

	if (title && title.trim().length > 0) {
		ops.push(
			makeTextElement({
				x: startX,
				y: 60,
				width: 760,
				height: 42,
				text: title.trim(),
				fontSize: 28,
			}),
		)
	}

	type NodeAnchor = { x: number; y: number; boxX: number; boxY: number }
	const anchors: NodeAnchor[] = []

	normalizedSteps.forEach((step, index) => {
		const boxX = isVertical ? startX : startX + index * (boxW + gap)
		const boxY = isVertical ? startY + index * (boxH + gap) : startY
		const isDecision = /\b(decisão|decision|if|else|aprovar|approve|validar|validate)\b/i.test(
			step,
		)
		ops.push(
			isDecision
				? makeDiamondElement({
						x: boxX,
						y: boxY,
						width: boxW,
						height: boxH,
						backgroundColor: "#111827",
						strokeColor: "#f59e0b",
					})
				: makeRectangleElement({
						x: boxX,
						y: boxY,
						width: boxW,
						height: boxH,
						backgroundColor: index === 0 ? "#0f172a" : "#111827",
						strokeColor: index === 0 ? "#22d3ee" : "#94a3b8",
					}),
		)
		const textBox = centerTextInBox({
			boxX,
			boxY,
			boxW,
			boxH,
			text: step,
			fontSize: 18,
		})
		ops.push(
			makeTextElement({
				x: textBox.x,
				y: textBox.y,
				width: textBox.width,
				height: textBox.height,
				text: step,
				fontSize: 18,
			}),
		)
		anchors.push({
			x: boxX + boxW / 2,
			y: boxY + boxH / 2,
			boxX,
			boxY,
		})
	})

	for (let i = 0; i < anchors.length - 1; i += 1) {
		const from = anchors[i]!
		const to = anchors[i + 1]!
		ops.push(
			makeArrowElement({
				x: from.x,
				y: from.y,
				dx: to.x - from.x,
				dy: to.y - from.y,
				strokeColor: "#64748b",
			}),
		)
	}

	const width = isVertical ? 1000 : Math.max(1200, startX + normalizedSteps.length * (boxW + gap))
	const height = isVertical ? Math.max(900, startY + normalizedSteps.length * (boxH + gap)) : 720
	ops.push({ type: "cameraUpdate", x: 80, y: 40, width, height })

	const result = await applyCanvasCreateView({
		client,
		userId,
		canvasId,
		input: JSON.stringify(ops),
		mode,
		baseVersion,
		source: "agent:flowchart",
	})

	return {
		canvasId,
		stepCount: normalizedSteps.length,
		direction: isVertical ? "vertical" : "horizontal",
		result,
	}
}

export async function summarizeCanvasSceneForAgent({
	client,
	userId,
	canvasId,
}: {
	client: SupabaseClient
	userId: string
	canvasId: string
}) {
	const scene = await readCanvasSceneForAgent({
		client,
		userId,
		canvasId,
		elementLimit: 400,
		includeRaw: false,
	})

	const topTypes = Object.entries(scene.stats.countByType)
		.sort((a, b) => b[1] - a[1])
		.slice(0, 8)
		.map(([type, count]) => ({ type, count }))

	const textPreview = scene.textSnippets.slice(0, 12)
	const textCorpus = textPreview.join(" | ").toLowerCase()
	const inferredKind = (() => {
		if (
			scene.stats.arrowElementCount >= 2 &&
			/\b(start|end|process|step|aprovar|validar|fluxo|workflow)\b/i.test(textCorpus)
		) {
			return "flowchart/workflow"
		}
		if (
			scene.stats.arrowElementCount >= 2 &&
			/\bmapa|mindmap|brainstorm|ideia|topic|branch|ramo\b/i.test(textCorpus)
		) {
			return "mindmap"
		}
		if ((scene.stats.countByType.rectangle ?? 0) + (scene.stats.countByType.diamond ?? 0) >= 3) {
			return "diagram"
		}
		return "freeform canvas"
	})()

	const prose = [
		`Canvas "${scene.name}" com ${scene.stats.totalElements} elementos (versão ${scene.canvasVersion}).`,
		`Tipo provável: ${inferredKind}.`,
		topTypes.length > 0
			? `Tipos mais comuns: ${topTypes.map((t) => `${t.type} (${t.count})`).join(", ")}.`
			: null,
		scene.bounds
			? `Área ocupada aproximada: ${Math.round(scene.bounds.width)}x${Math.round(scene.bounds.height)}.`
			: "Sem bounds detectáveis.",
		textPreview.length > 0
			? `Textos detectados (amostra): ${textPreview.join(" | ")}`
			: "Nenhum texto detectado nos elementos.",
	]
		.filter((line): line is string => Boolean(line))
		.join(" ")

	return {
		canvasId,
		name: scene.name,
		canvasVersion: scene.canvasVersion,
		inferredKind,
		stats: scene.stats,
		bounds: scene.bounds,
		topTypes,
		textPreview,
		summary: prose,
	}
}

export async function clearCanvasForAgent({
	client,
	userId,
	canvasId,
}: {
	client: SupabaseClient
	userId: string
	canvasId: string
}) {
	const scene = await readCanvasSceneForAgent({
		client,
		userId,
		canvasId,
		elementLimit: 1,
		includeRaw: false,
	})
	const deletedCount = scene.stats.totalElements

	const result = await applyCanvasCreateView({
		client,
		userId,
		canvasId,
		input: "[]",
		mode: "replace",
		source: "agent:clear",
	})

	return {
		canvasId,
		deletedCount,
		canvasVersion: result.canvasVersion,
		result,
	}
}
