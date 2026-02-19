import type { SupabaseClient } from "@supabase/supabase-js"
import {
	CanvasCreateViewResultSchema,
	CanvasToolModeSchema,
} from "@repo/validation/api"
import { z } from "zod"

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

export const CANVAS_READ_ME_TEXT = `Canvas Tooling (Kortix)

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
