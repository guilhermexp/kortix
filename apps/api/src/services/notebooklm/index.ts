/**
 * NotebookLM Integration — Public API
 */

export { ArtifactsAPI } from "./api/artifacts"
export { ChatAPI } from "./api/chat"
export { NotebooksAPI } from "./api/notebooks"
export { SourcesAPI } from "./api/sources"
export {
	type AuthTokens,
	buildAuthTokens,
	parsePlaywrightCookies,
	parseRawCookies,
	type StoredCookies,
} from "./auth"
export { NotebookLMClient } from "./client"
export {
	createNotebookForProject,
	isNotebookLMConnected,
	syncDocumentToNotebookLM,
} from "./sync"
export {
	type Artifact,
	ArtifactStatus,
	ArtifactTypeCode,
	type AskResult,
	AudioFormat,
	AudioLength,
	AuthError,
	type ChatReference,
	type GenerationStatus,
	InfographicDetail,
	InfographicOrientation,
	type Note,
	type Notebook,
	type NotebookDescription,
	NotebookLMError,
	RateLimitError,
	ReportFormat,
	RPCError,
	SlideDeckFormat,
	SlideDeckLength,
	type Source,
	SourceStatus,
	VideoFormat,
	VideoStyle,
} from "./types"
