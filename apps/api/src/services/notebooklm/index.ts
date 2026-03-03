/**
 * NotebookLM Integration — Public API
 */

export { NotebookLMClient } from "./client"
export { ArtifactsAPI } from "./api/artifacts"
export { ChatAPI } from "./api/chat"
export { NotebooksAPI } from "./api/notebooks"
export { SourcesAPI } from "./api/sources"
export {
	type AuthTokens,
	type StoredCookies,
	buildAuthTokens,
	parsePlaywrightCookies,
	parseRawCookies,
} from "./auth"
export {
	type Artifact,
	type AskResult,
	type ChatReference,
	type GenerationStatus,
	type Notebook,
	type NotebookDescription,
	type Note,
	type Source,
	AudioFormat,
	AudioLength,
	VideoFormat,
	VideoStyle,
	ReportFormat,
	InfographicOrientation,
	InfographicDetail,
	SlideDeckFormat,
	SlideDeckLength,
	ArtifactStatus,
	ArtifactTypeCode,
	SourceStatus,
	AuthError,
	RPCError,
	RateLimitError,
	NotebookLMError,
} from "./types"
export {
	syncDocumentToNotebookLM,
	createNotebookForProject,
	isNotebookLMConnected,
} from "./sync"
