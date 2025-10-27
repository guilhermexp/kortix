/**
 * Internationalization (i18n) Support
 *
 * Provides type-safe translation functions for prompts and messages.
 * Currently supports Portuguese (pt-BR) and English (en-US).
 */

import ptBR from "./locales/pt-BR.json" assert { type: "json" }

import enUS from "./locales/en-US.json" assert { type: "json" }

/**
 * Supported locales
 */
export type Locale = "pt-BR" | "en-US"

/**
 * Translation structure type (inferred from pt-BR)
 */
export type Translations = typeof ptBR

/**
 * Available translations by locale
 */
const translations: Record<Locale, Translations> = {
	"pt-BR": ptBR,
	"en-US": enUS,
}

/**
 * Default locale (Portuguese for Supermemory)
 */
const DEFAULT_LOCALE: Locale = "pt-BR"

/**
 * Template variable pattern: {{variable}}
 */
const TEMPLATE_PATTERN = /\{\{(\w+)\}\}/g

/**
 * Replace template variables in a string
 *
 * @example
 * replaceVariables("Hello {{name}}", { name: "World" })
 * // => "Hello World"
 */
function replaceVariables(
	template: string,
	variables?: Record<string, string | number | null | undefined>,
): string {
	if (!variables) return template

	return template.replace(TEMPLATE_PATTERN, (match, key) => {
		const value = variables[key]
		return value !== undefined && value !== null ? String(value) : match
	})
}

/**
 * Get translation by path with optional variable replacement
 *
 * @param path - Dot-notation path to translation key
 * @param variables - Optional variables to replace in template
 * @param locale - Locale to use (defaults to pt-BR)
 *
 * @example
 * t("prompts.summary.system")
 * t("prompts.summary.context.detected_title", { title: "My Title" })
 */
export function t(
	path: string,
	variables?: Record<string, string | number | null | undefined>,
	locale: Locale = DEFAULT_LOCALE,
): string {
	const keys = path.split(".")
	let value: any = translations[locale]

	for (const key of keys) {
		if (value && typeof value === "object" && key in value) {
			value = value[key]
		} else {
			console.warn(`Translation not found: ${path} (locale: ${locale})`)
			return path
		}
	}

	if (typeof value !== "string") {
		console.warn(`Translation path is not a string: ${path}`)
		return path
	}

	return replaceVariables(value, variables)
}

/**
 * Get translations object for a specific locale
 */
export function getTranslations(locale: Locale = DEFAULT_LOCALE): Translations {
	return translations[locale]
}

/**
 * Check if a locale is supported
 */
export function isLocaleSupported(locale: string): locale is Locale {
	return locale === "pt-BR" || locale === "en-US"
}

/**
 * Helper function to build summary prompt
 */
export function buildSummaryPrompt(
	content: string,
	context?: { title?: string | null; url?: string | null },
	locale: Locale = DEFAULT_LOCALE,
): string {
	const parts: string[] = [
		t("prompts.summary.system", undefined, locale),
		t("prompts.summary.format_instruction", undefined, locale),
		t("prompts.summary.sections.executive", undefined, locale),
		t("prompts.summary.sections.key_points", undefined, locale),
		t("prompts.summary.sections.use_cases", undefined, locale),
	]

	if (context?.title) {
		parts.push(t("prompts.summary.context.detected_title", { title: context.title }, locale))
	}

	if (context?.url) {
		parts.push(t("prompts.summary.context.source", { url: context.url }, locale))
	}

	parts.push(t("prompts.summary.footer", { content }, locale))

	return parts.join("\n\n")
}

/**
 * Helper function to build URL analysis prompt
 */
export function buildUrlAnalysisPrompt(
	url: string,
	options?: {
		title?: string | null
		isGitHub?: boolean
	},
	locale: Locale = DEFAULT_LOCALE,
): string {
	const parts: string[] = [
		t("prompts.deepAnalysis.system", undefined, locale),
		t("prompts.deepAnalysis.url_based.intro", { url }, locale),
		"",
		t("prompts.deepAnalysis.url_based.format", undefined, locale),
		"",
		t("prompts.deepAnalysis.url_based.sections.executive", undefined, locale),
		"",
		t("prompts.deepAnalysis.url_based.sections.key_points", undefined, locale),
		"",
	]

	if (options?.isGitHub) {
		parts.push(t("prompts.deepAnalysis.url_based.sections.technologies", undefined, locale))
		parts.push("")
	}

	parts.push(
		t("prompts.deepAnalysis.url_based.sections.use_cases", undefined, locale),
		"",
		t("prompts.deepAnalysis.url_based.footer", undefined, locale),
	)

	if (options?.title) {
		parts.push(
			"",
			t("prompts.deepAnalysis.url_based.sections.context_title", { title: options.title }, locale),
		)
	}

	return parts.join("\n")
}

/**
 * Helper function to build text-based analysis prompt
 */
export function buildTextAnalysisPrompt(
	content: string,
	options?: {
		title?: string | null
		url?: string | null
		isGitHub?: boolean
		isPDF?: boolean
		isWebPage?: boolean
	},
	locale: Locale = DEFAULT_LOCALE,
): string {
	const parts: string[] = [
		t("prompts.deepAnalysis.system", undefined, locale),
		t("prompts.deepAnalysis.text_based.intro", undefined, locale),
		"",
		t("prompts.deepAnalysis.text_based.sections.executive", undefined, locale),
		"",
		t("prompts.deepAnalysis.text_based.sections.key_points", undefined, locale),
		"",
	]

	if (options?.isGitHub) {
		parts.push(
			t("prompts.deepAnalysis.text_based.sections.technologies", undefined, locale),
			"",
		)
	}

	parts.push(
		t("prompts.deepAnalysis.text_based.sections.use_cases", undefined, locale),
		"",
	)

	if (options?.isPDF || options?.isWebPage) {
		parts.push(
			t("prompts.deepAnalysis.text_based.sections.additional_context", undefined, locale),
			"",
		)
	}

	if (options?.title) {
		parts.push(t("prompts.deepAnalysis.text_based.context.title", { title: options.title }, locale))
	}

	if (options?.url) {
		parts.push(t("prompts.deepAnalysis.text_based.context.source", { url: options.url }, locale))
	}

	parts.push(
		"",
		t("prompts.deepAnalysis.text_based.footer", { content }, locale),
	)

	return parts.join("\n")
}

/**
 * Helper function to build YouTube video prompt
 */
export function buildYoutubePrompt(locale: Locale = DEFAULT_LOCALE): string {
	return [
		t("prompts.youtube.intro", undefined, locale),
		"",
		t("prompts.youtube.sections.executive", undefined, locale),
		"",
		t("prompts.youtube.sections.main_points", undefined, locale),
		"",
		t("prompts.youtube.sections.use_cases", undefined, locale),
		"",
		t("prompts.youtube.sections.visual_context", undefined, locale),
		"",
		t("prompts.youtube.footer", undefined, locale),
	].join("\n")
}

/**
 * Helper function to build file processing prompt
 */
export function buildFilePrompt(
	mimeType: string,
	filename?: string,
	locale: Locale = DEFAULT_LOCALE,
): string {
	const lowerMime = mimeType.toLowerCase()

	let promptType: "image" | "audio" | "video" | "document"

	if (lowerMime.startsWith("image/")) {
		promptType = "image"
	} else if (lowerMime.startsWith("audio/")) {
		promptType = "audio"
	} else if (lowerMime.startsWith("video/")) {
		promptType = "video"
	} else {
		promptType = "document"
	}

	const parts = [
		t(`prompts.fileProcessing.${promptType}.intro`, undefined, locale),
		t(`prompts.fileProcessing.${promptType}.instructions`, undefined, locale),
	]

	if (filename) {
		parts.push(t(`prompts.fileProcessing.${promptType}.filename`, { filename }, locale))
	}

	return parts.filter(Boolean).join("\n\n")
}

/**
 * Get fallback message
 */
export function getFallbackMessage(
	key: keyof Translations["fallbackMessages"],
	locale: Locale = DEFAULT_LOCALE,
): string {
	return t(`fallbackMessages.${String(key)}`, undefined, locale)
}

/**
 * Get section header
 */
export function getSectionHeader(
	key: keyof Translations["sectionHeaders"],
	locale: Locale = DEFAULT_LOCALE,
): string {
	return t(`sectionHeaders.${String(key)}`, undefined, locale)
}
