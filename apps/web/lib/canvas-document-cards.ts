type CanvasDocumentCardInput = {
	id: string
	title: string
	summary?: string | null
	snippet?: string | null
	filename?: string | null
	mimeType?: string | null
	type?: string | null
	wordCount?: number | null
	link?: string | null
}

type CardPlacementOptions = {
	startX: number
	startY: number
	columns?: number
	gapX?: number
	gapY?: number
	cardWidth?: number
	cardHeight?: number
}

const DEFAULT_CARD_WIDTH = 340
const DEFAULT_CARD_HEIGHT = 236

const BADGE_STYLES: Record<
	string,
	{ label: string; backgroundColor: string; strokeColor: string }
> = {
	md: { label: "MD", backgroundColor: "#4f46e5", strokeColor: "#4338ca" },
	pdf: { label: "PDF", backgroundColor: "#ef4444", strokeColor: "#dc2626" },
	doc: { label: "DOC", backgroundColor: "#3b82f6", strokeColor: "#2563eb" },
	docx: { label: "DOC", backgroundColor: "#3b82f6", strokeColor: "#2563eb" },
	xls: { label: "XLS", backgroundColor: "#22c55e", strokeColor: "#16a34a" },
	xlsx: { label: "XLS", backgroundColor: "#22c55e", strokeColor: "#16a34a" },
	ppt: { label: "PPT", backgroundColor: "#f59e0b", strokeColor: "#d97706" },
	pptx: { label: "PPT", backgroundColor: "#f59e0b", strokeColor: "#d97706" },
}

const FALLBACK_BADGE = {
	label: "FILE",
	backgroundColor: "#64748b",
	strokeColor: "#475569",
}

function makeElementId(prefix: string) {
	if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
		return `${prefix}_${crypto.randomUUID().slice(0, 8)}`
	}
	return `${prefix}_${Math.random().toString(36).slice(2, 10)}`
}

function stripMarkdown(raw: string) {
	return raw
		.replace(/```[\s\S]*?```/g, " ")
		.replace(/`([^`]+)`/g, "$1")
		.replace(/!\[[^\]]*]\([^)]+\)/g, " ")
		.replace(/\[([^\]]+)]\([^)]+\)/g, "$1")
		.replace(/^#{1,6}\s+/gm, "")
		.replace(/[*_~>-]/g, " ")
		.replace(/\s+/g, " ")
		.trim()
}

function truncate(value: string, max = 120) {
	if (value.length <= max) return value
	return `${value.slice(0, Math.max(0, max - 1)).trimEnd()}...`
}

function deriveExtension(input: CanvasDocumentCardInput) {
	const filename = (input.filename ?? "").toLowerCase()
	if (filename.includes(".")) {
		const ext = filename.split(".").pop()
		if (ext) return ext
	}
	const mime = (input.mimeType ?? "").toLowerCase()
	if (mime.includes("markdown")) return "md"
	if (mime.includes("pdf")) return "pdf"
	if (mime.includes("word")) return "doc"
	if (mime.includes("sheet") || mime.includes("excel")) return "xls"
	if (mime.includes("powerpoint") || mime.includes("presentation")) return "ppt"
	const type = (input.type ?? "").toLowerCase()
	if (type === "text" || type === "document-summary") return "md"
	return "file"
}

function resolveBadgeStyle(input: CanvasDocumentCardInput) {
	const ext = deriveExtension(input)
	return BADGE_STYLES[ext] ?? FALLBACK_BADGE
}

function estimateTextSize(text: string, fontSize: number, maxWidth: number) {
	const width = Math.max(
		80,
		Math.min(maxWidth, Math.round(text.length * (fontSize * 0.62))),
	)
	const height = Math.max(22, Math.round(fontSize * 1.35))
	return { width, height }
}

function makeBaseElement(type: string, overrides: Record<string, unknown>) {
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
		strokeWidth: 1,
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

function makeTextElement(params: {
	text: string
	x: number
	y: number
	fontSize?: number
	maxWidth?: number
	groupId: string
	strokeColor?: string
}) {
	const fontSize = params.fontSize ?? 18
	const measured = estimateTextSize(params.text, fontSize, params.maxWidth ?? 280)
	return makeBaseElement("text", {
		x: params.x,
		y: params.y,
		width: measured.width,
		height: measured.height,
		text: params.text,
		fontSize,
		fontFamily: 3,
		textAlign: "left",
		verticalAlign: "top",
		containerId: null,
		originalText: params.text,
		lineHeight: 1.25,
		autoResize: true,
		backgroundColor: "transparent",
		strokeColor: params.strokeColor ?? "#3f3a35",
		groupIds: [params.groupId],
	})
}

function makeLinePlaceholder(params: {
	x: number
	y: number
	width: number
	groupId: string
}) {
	return makeBaseElement("rectangle", {
		x: params.x,
		y: params.y,
		width: params.width,
		height: 8,
		strokeColor: "#d7d1c9",
		backgroundColor: "#d7d1c9",
		strokeWidth: 1,
		roundness: { type: 3 },
		groupIds: [params.groupId],
	})
}

function buildCardElements(
	doc: CanvasDocumentCardInput,
	x: number,
	y: number,
	cardWidth: number,
	cardHeight: number,
) {
	const groupId = makeElementId("doc_group")
	const title = truncate(doc.title.trim() || "Untitled Document", 34)
	const sourceText = doc.snippet || doc.summary || ""
	const snippet = truncate(stripMarkdown(sourceText), 72) || "Markdown document"
	const badge = resolveBadgeStyle(doc)
	const footer =
		typeof doc.wordCount === "number" && Number.isFinite(doc.wordCount)
			? `${Intl.NumberFormat("en-US").format(doc.wordCount)} words`
			: (doc.filename ?? "Markdown")

	const card = makeBaseElement("rectangle", {
		x,
		y,
		width: cardWidth,
		height: cardHeight,
		strokeColor: "#d9d2c8",
		backgroundColor: "#fbf9f5",
		strokeWidth: 1,
		roundness: { type: 3 },
		groupIds: [groupId],
		link: doc.link ?? null,
	})

	const header = makeBaseElement("rectangle", {
		x: x + 14,
		y: y + 14,
		width: cardWidth - 28,
		height: cardHeight - 118,
		strokeColor: "#e4ddd2",
		backgroundColor: "#efe9df",
		strokeWidth: 1,
		roundness: { type: 3 },
		groupIds: [groupId],
	})

	const placeholders = [
		makeLinePlaceholder({
			x: x + 28,
			y: y + 34,
			width: cardWidth - 110,
			groupId,
		}),
		makeLinePlaceholder({
			x: x + 28,
			y: y + 50,
			width: cardWidth - 140,
			groupId,
		}),
		makeLinePlaceholder({
			x: x + 28,
			y: y + 66,
			width: cardWidth - 94,
			groupId,
		}),
	]

	const titleElement = makeTextElement({
		text: title,
		x: x + 22,
		y: y + cardHeight - 84,
		fontSize: 20,
		maxWidth: cardWidth - 120,
		groupId,
		strokeColor: "#7a635a",
	})

	const snippetElement = makeTextElement({
		text: snippet,
		x: x + 22,
		y: y + cardHeight - 50,
		fontSize: 14,
		maxWidth: cardWidth - 120,
		groupId,
		strokeColor: "#9b8a80",
	})

	const footerElement = makeTextElement({
		text: truncate(footer, 24),
		x: x + 22,
		y: y + cardHeight - 24,
		fontSize: 12,
		maxWidth: cardWidth - 140,
		groupId,
		strokeColor: "#afa198",
	})

	const badgeRect = makeBaseElement("rectangle", {
		x: x + cardWidth - 64,
		y: y + cardHeight - 54,
		width: 42,
		height: 32,
		strokeColor: badge.strokeColor,
		backgroundColor: badge.backgroundColor,
		strokeWidth: 1,
		roundness: { type: 3 },
		groupIds: [groupId],
	})

	const badgeText = makeTextElement({
		text: badge.label,
		x: x + cardWidth - 58,
		y: y + cardHeight - 45,
		fontSize: 14,
		maxWidth: 34,
		groupId,
		strokeColor: "#ffffff",
	})

	return [
		card,
		header,
		...placeholders,
		titleElement,
		snippetElement,
		footerElement,
		badgeRect,
		badgeText,
	]
}

export function buildDocumentCardsElements(
	documents: CanvasDocumentCardInput[],
	options: CardPlacementOptions,
) {
	const columns = Math.max(1, Math.min(4, options.columns ?? 3))
	const gapX = Math.max(12, options.gapX ?? 28)
	const gapY = Math.max(12, options.gapY ?? 28)
	const cardWidth = Math.max(260, options.cardWidth ?? DEFAULT_CARD_WIDTH)
	const cardHeight = Math.max(180, options.cardHeight ?? DEFAULT_CARD_HEIGHT)

	const elements: Record<string, unknown>[] = []
	for (let index = 0; index < documents.length; index += 1) {
		const doc = documents[index]
		if (!doc) continue
		const col = index % columns
		const row = Math.floor(index / columns)
		const x = options.startX + col * (cardWidth + gapX)
		const y = options.startY + row * (cardHeight + gapY)
		elements.push(...buildCardElements(doc, x, y, cardWidth, cardHeight))
	}
	return elements
}
