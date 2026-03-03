/**
 * NotebookLM TypeScript Client — Types & Enums
 * Ported from notebooklm-py (https://github.com/teng-lin/notebooklm-py)
 */

// ─── Endpoints ───────────────────────────────────────────────

export const BATCHEXECUTE_URL =
	"https://notebooklm.google.com/_/LabsTailwindUi/data/batchexecute"
export const QUERY_URL =
	"https://notebooklm.google.com/_/LabsTailwindUi/data/google.internal.labs.tailwind.orchestration.v1.LabsTailwindOrchestrationService/GenerateFreeFormStreamed"
export const UPLOAD_URL = "https://notebooklm.google.com/upload/_/"
export const NOTEBOOKLM_HOME = "https://notebooklm.google.com/"

// ─── RPC Method IDs ──────────────────────────────────────────

export const RPCMethod = {
	LIST_NOTEBOOKS: "wXbhsf",
	CREATE_NOTEBOOK: "CCqFvf",
	GET_NOTEBOOK: "rLM1Ne",
	RENAME_NOTEBOOK: "s0tc2d",
	DELETE_NOTEBOOK: "WWINqb",
	ADD_SOURCE: "izAoDd",
	ADD_SOURCE_FILE: "o4cbdc",
	DELETE_SOURCE: "tGMBJ",
	GET_SOURCE: "hizoJc",
	REFRESH_SOURCE: "FLmJqe",
	CHECK_SOURCE_FRESHNESS: "yR9Yof",
	UPDATE_SOURCE: "b7Wfje",
	SUMMARIZE: "VfAZjd",
	GET_SOURCE_GUIDE: "tr032e",
	GET_SUGGESTED_REPORTS: "ciyUvf",
	CREATE_ARTIFACT: "R7cb6c",
	LIST_ARTIFACTS: "gArtLc",
	DELETE_ARTIFACT: "V5N4be",
	RENAME_ARTIFACT: "rc3d8d",
	EXPORT_ARTIFACT: "Krh3pd",
	SHARE_ARTIFACT: "RGP97b",
	GET_INTERACTIVE_HTML: "v9rmvd",
	REVISE_SLIDE: "KmcKPe",
	START_FAST_RESEARCH: "Ljjv0c",
	START_DEEP_RESEARCH: "QA9ei",
	POLL_RESEARCH: "e3bVqc",
	IMPORT_RESEARCH: "LBwxtb",
	GENERATE_MIND_MAP: "yyryJe",
	CREATE_NOTE: "CYK0Xb",
	GET_NOTES_AND_MIND_MAPS: "cFji9",
	UPDATE_NOTE: "cYAfTb",
	DELETE_NOTE: "AH0mwd",
	GET_LAST_CONVERSATION_ID: "hPTbtc",
	GET_CONVERSATION_TURNS: "khqZz",
	SHARE_NOTEBOOK: "QDyure",
	GET_SHARE_STATUS: "JFMDGd",
	REMOVE_RECENTLY_VIEWED: "fejl7e",
	GET_USER_SETTINGS: "ZwVcOc",
	SET_USER_SETTINGS: "hT54vc",
} as const

export type RPCMethodKey = keyof typeof RPCMethod
export type RPCMethodValue = (typeof RPCMethod)[RPCMethodKey]

// ─── Artifact Types ──────────────────────────────────────────

export const ArtifactTypeCode = {
	AUDIO: 1,
	REPORT: 2,
	VIDEO: 3,
	QUIZ_OR_FLASHCARDS: 4,
	MIND_MAP: 5,
	INFOGRAPHIC: 7,
	SLIDE_DECK: 8,
	DATA_TABLE: 9,
} as const

export const ArtifactStatus = {
	PROCESSING: 1,
	PENDING: 2,
	COMPLETED: 3,
	FAILED: 4,
} as const

// ─── Audio ───────────────────────────────────────────────────

export const AudioFormat = {
	DEEP_DIVE: 1,
	BRIEF: 2,
	CRITIQUE: 3,
	DEBATE: 4,
} as const

export const AudioLength = {
	SHORT: 1,
	DEFAULT: 2,
	LONG: 3,
} as const

// ─── Video ───────────────────────────────────────────────────

export const VideoFormat = {
	EXPLAINER: 1,
	BRIEF: 2,
} as const

export const VideoStyle = {
	AUTO_SELECT: "AUTO_SELECT",
	CUSTOM: "CUSTOM",
	CLASSIC: "CLASSIC",
	WHITEBOARD: "WHITEBOARD",
	KAWAII: "KAWAII",
	ANIME: "ANIME",
	WATERCOLOR: "WATERCOLOR",
	RETRO_PRINT: "RETRO_PRINT",
	HERITAGE: "HERITAGE",
	PAPER_CRAFT: "PAPER_CRAFT",
} as const

// ─── Report ──────────────────────────────────────────────────

export const ReportFormat = {
	BRIEFING_DOC: "BRIEFING_DOC",
	STUDY_GUIDE: "STUDY_GUIDE",
	BLOG_POST: "BLOG_POST",
	CUSTOM: "CUSTOM",
} as const

// ─── Quiz / Flashcards ──────────────────────────────────────

export const QuizQuantity = {
	FEWER: 1,
	STANDARD: 2,
} as const

export const QuizDifficulty = {
	EASY: 1,
	MEDIUM: 2,
	HARD: 3,
} as const

// ─── Infographic ─────────────────────────────────────────────

export const InfographicOrientation = {
	LANDSCAPE: 1,
	PORTRAIT: 2,
	SQUARE: 3,
} as const

export const InfographicDetail = {
	CONCISE: 1,
	STANDARD: 2,
	DETAILED: 3,
} as const

// ─── Slide Deck ──────────────────────────────────────────────

export const SlideDeckFormat = {
	DETAILED_DECK: 1,
	PRESENTER_SLIDES: 2,
} as const

export const SlideDeckLength = {
	DEFAULT: 1,
	SHORT: 2,
} as const

// ─── Chat ────────────────────────────────────────────────────

export const ChatGoal = {
	DEFAULT: 1,
	CUSTOM: 2,
	LEARNING_GUIDE: 3,
} as const

export const ChatResponseLength = {
	DEFAULT: 1,
	LONGER: 4,
	SHORTER: 5,
} as const

// ─── Source ──────────────────────────────────────────────────

export const SourceStatus = {
	PROCESSING: 1,
	READY: 2,
	ERROR: 3,
	PREPARING: 5,
} as const

export const SourceTypeCode: Record<number, string> = {
	1: "google_docs",
	2: "google_slides",
	3: "pdf",
	4: "pasted_text",
	5: "web_page",
	8: "markdown",
	9: "youtube",
	10: "media",
	11: "docx",
	13: "image",
	14: "google_spreadsheet",
	16: "csv",
}

// ─── Sharing ─────────────────────────────────────────────────

export const ShareAccess = {
	RESTRICTED: 0,
	ANYONE_WITH_LINK: 1,
} as const

export const ShareViewLevel = {
	FULL_NOTEBOOK: 0,
	CHAT_ONLY: 1,
} as const

export const SharePermission = {
	OWNER: 1,
	EDITOR: 2,
	VIEWER: 3,
} as const

// ─── Export ──────────────────────────────────────────────────

export const ExportType = {
	DOCS: 1,
	SHEETS: 2,
} as const

// ─── Data Interfaces ─────────────────────────────────────────

export interface Notebook {
	id: string
	title: string
	createdAt: Date | null
	sourcesCount: number
	isOwner: boolean
}

export interface NotebookDescription {
	summary: string
	suggestedTopics: Array<{
		title: string
		followUp: string | null
	}>
}

export interface Source {
	id: string
	title: string
	url: string | null
	kind: string
	createdAt: Date | null
	status: number
	isReady: boolean
	isProcessing: boolean
	isError: boolean
}

export interface Artifact {
	id: string
	title: string
	kind: string
	status: number
	createdAt: Date | null
	url: string | null
	isCompleted: boolean
	isProcessing: boolean
	isFailed: boolean
	reportContent: string | null
	audioUrls: string[]
	videoUrls: string[]
}

export interface GenerationStatus {
	taskId: string | null
	status: number
	url: string | null
	error: string | null
	isComplete: boolean
	isFailed: boolean
	isRateLimited: boolean
}

export interface ChatReference {
	sourceId: string
	citedText: string
	startChar: number | null
	endChar: number | null
}

export interface AskResult {
	answer: string
	conversationId: string | null
	turnNumber: number
	isFollowUp: boolean
	references: ChatReference[]
}

export interface Note {
	id: string
	notebookId: string
	title: string
	content: string
	createdAt: Date | null
}

// ─── RPC Error Types ─────────────────────────────────────────

export class NotebookLMError extends Error {
	constructor(
		message: string,
		public code?: string,
	) {
		super(message)
		this.name = "NotebookLMError"
	}
}

export class AuthError extends NotebookLMError {
	constructor(message: string) {
		super(message, "AUTH_ERROR")
		this.name = "AuthError"
	}
}

export class RateLimitError extends NotebookLMError {
	constructor(message: string) {
		super(message, "RATE_LIMIT")
		this.name = "RateLimitError"
	}
}

export class RPCError extends NotebookLMError {
	constructor(
		message: string,
		public statusCode?: number,
	) {
		super(message, "RPC_ERROR")
		this.name = "RPCError"
	}
}
