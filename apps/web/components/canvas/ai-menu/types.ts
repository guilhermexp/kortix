import type { ReactNode } from "react"

export type AIMenuState = "input" | "generating" | "finished" | "error"

export interface AIAction {
	id: string
	name: string
	icon: ReactNode
	beta?: boolean
}

export interface AIActionGroup {
	name: string
	items: AIAction[]
}

export interface AISubItem {
	type: string
	label?: string
}

// Supported languages for translation
export const TRANSLATE_LANGUAGES = [
	"English",
	"Spanish",
	"French",
	"German",
	"Italian",
	"Portuguese",
	"Russian",
	"Japanese",
	"Korean",
	"Chinese (Simplified)",
	"Chinese (Traditional)",
	"Arabic",
	"Hindi",
	"Dutch",
	"Swedish",
	"Polish",
	"Turkish",
	"Vietnamese",
	"Thai",
	"Indonesian",
] as const

// Supported tones for text transformation
export const TEXT_TONES = [
	"Professional",
	"Casual",
	"Direct",
	"Confident",
	"Friendly",
	"Formal",
	"Humorous",
	"Empathetic",
	"Authoritative",
	"Inspirational",
] as const

export type TranslateLanguage = (typeof TRANSLATE_LANGUAGES)[number]
export type TextTone = (typeof TEXT_TONES)[number]
