/**
 * Central Configuration Constants
 *
 * This file consolidates all hardcoded values used throughout the API.
 * Organized by functional domain for easy maintenance and modification.
 */

// ============================================================================
// AI Models Configuration
// ============================================================================

export const AI_MODELS = {
	/** Gemini Flash model for summarization and analysis */
	GEMINI_FLASH: "gemini-2.0-flash",
} as const

// ============================================================================
// Text Processing Limits
// ============================================================================

export const TEXT_LIMITS = {
	/** Maximum characters for summary generation (6KB) */
	SUMMARY_MAX_CHARS: 6000,

	/** Maximum characters for deep analysis (20KB) */
	ANALYSIS_MAX_CHARS: 20000,

	/** Maximum characters for memory content fallback */
	MEMORY_CONTENT_FALLBACK: 2000,

	/** Maximum characters for fallback summary preview */
	FALLBACK_SUMMARY_PREVIEW: 200,
} as const

// ============================================================================
// AI Generation Configuration
// ============================================================================

export const AI_GENERATION_CONFIG = {
	/** Token limits for different operations */
	TOKENS: {
		SUMMARY: 256,
		ANALYSIS: 1024,
		YOUTUBE_SUMMARY: 2048,
	},

	/** Temperature settings for AI generation */
	TEMPERATURE: {
		DEFAULT: 0.3,
		YOUTUBE: 0.4,
	},

	/** Sentence limits for fallback summaries */
	FALLBACK: {
		EXECUTIVE_SENTENCES: 2,
		MAX_KEY_POINTS: 10,
		MAX_USE_CASES: 4,
	},
} as const

// ============================================================================
// File Processing Limits
// ============================================================================

export const FILE_LIMITS = {
	/** Maximum size for individual file (1MB) */
	MAX_FILE_SIZE_BYTES: 1024 * 1024,

	/** Maximum total repository size (10MB) */
	MAX_TOTAL_REPO_SIZE_BYTES: 10 * 1024 * 1024,

	/** Request timeout for MarkItDown service (60 seconds) */
	MARKITDOWN_REQUEST_TIMEOUT_MS: 60_000,
} as const

// ============================================================================
// Gemini File API Configuration
// ============================================================================

export const GEMINI_FILE_CONFIG = {
	/** Polling interval for file processing status (1 second) */
	POLL_INTERVAL_MS: 1_000,

	/** Maximum polling attempts before timeout (30 seconds total) */
	MAX_POLL_ATTEMPTS: 30,
} as const

// ============================================================================
// Content Detection Patterns
// ============================================================================

export const CONTENT_PATTERNS = {
	/**
	 * Portuguese action verbs regex for use case detection in fallback summaries
	 * Matches common imperative and recommendation patterns
	 */
	ACTION_VERBS_PT:
		/deve|faça|passo|recomenda|sugere|precisa|evite|comece|conclua|usar|aplique|utilize|serve para|pode ser usado/i,

	/**
	 * Regex to check if "Casos de Uso" section exists in markdown
	 */
	USE_CASES_SECTION: /(^|\n)##\s*Casos\s*de\s*Uso(\s|\n)/i,
} as const

// ============================================================================
// Markdown Template Sections
// ============================================================================

export const MARKDOWN_SECTIONS = {
	/** Default section headers for summaries */
	SUMMARY: {
		EXECUTIVE: "## Resumo Executivo",
		KEY_POINTS: "## Pontos-Chave",
		USE_CASES: "## Casos de Uso",
		SOURCE: "## Fonte",
		TECH_STACK: "## Tecnologias e Ferramentas",
		CONTEXT: "## Contexto Adicional",
		VISUAL_CONTEXT: "## Contexto Visual",
	},

	/** Fallback messages when sections are empty */
	FALLBACK_MESSAGES: {
		NO_USE_CASES: "- (sem casos de uso identificados)",
		LIMITED_INFO: "- (informações limitadas para destacar)",
	},
} as const

// ============================================================================
// HTTP and Network Configuration
// ============================================================================

export const HTTP_CONFIG = {
	/** User agent for external HTTP requests */
	USER_AGENT: "SupermemorySelfHosted/1.0 (+self-hosted extractor)",

	/** Default request timeout (30 seconds) */
	DEFAULT_TIMEOUT_MS: 30_000,
} as const

// ============================================================================
// Content Type Detection
// ============================================================================

export const CONTENT_TYPES = {
	/** GitHub URL pattern */
	GITHUB_PATTERN: /github\.com/i,

	/** PDF content type */
	PDF_PATTERN: /pdf/i,

	/** HTML content type */
	HTML_PATTERN: /html/i,
} as const

// ============================================================================
// Summary Quality Thresholds
// ============================================================================

export const QUALITY_THRESHOLDS = {
	/** Minimum characters for a valid AI-generated summary */
	MIN_SUMMARY_LENGTH: 50,

	/** Minimum words in summary to be considered valid */
	MIN_WORD_COUNT: 10,
} as const

// ============================================================================
// Rate Limiting Configuration
// ============================================================================

export const RATE_LIMITS = {
	/** Default rate limit window in milliseconds (1 minute) */
	WINDOW_MS: 60_000,

	/** Rate limits per endpoint category */
	LIMITS: {
		/** General API endpoints (60 requests per minute) */
		DEFAULT: 60,

		/** Authentication endpoints (stricter - 10 requests per minute) */
		AUTH: 10,

		/** Document ingestion endpoints (30 requests per minute) */
		INGESTION: 30,

		/** Search endpoints (100 requests per minute - higher for read-heavy) */
		SEARCH: 100,

		/** Chat endpoints (20 requests per minute - expensive operations) */
		CHAT: 20,

		/** File upload endpoints (15 requests per minute) */
		UPLOAD: 15,
	},

	/** Skip rate limiting for specific paths (health checks, etc.) */
	SKIP_PATHS: ["/health", "/api/health", "/ping"] as const,
} as const

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get the Gemini model ID
 */
export function getGeminiModel(): string {
	return AI_MODELS.GEMINI_FLASH
}

/**
 * Check if URL is from GitHub
 */
export function isGitHubUrl(url?: string | null): boolean {
	if (!url) return false
	return CONTENT_TYPES.GITHUB_PATTERN.test(url)
}

/**
 * Check if content type is PDF
 */
export function isPdfContent(contentType?: string | null): boolean {
	if (!contentType) return false
	return CONTENT_TYPES.PDF_PATTERN.test(contentType)
}

/**
 * Check if content type is HTML/webpage
 */
export function isHtmlContent(
	contentType?: string | null,
	url?: string | null,
): boolean {
	if (contentType && CONTENT_TYPES.HTML_PATTERN.test(contentType)) return true
	if (url) return true // If there's a URL, assume it's a webpage
	return false
}
