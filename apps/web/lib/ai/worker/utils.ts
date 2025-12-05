// ============================================================
// TLDraw AI Worker Utilities
// ============================================================

import type { CoreMessage, TextPart, ImagePart } from "ai"

type MessagePart = TextPart | ImagePart | { type: "image"; image: string }

export function asMessage(
	role: "user" | "assistant",
	...parts: MessagePart[]
): CoreMessage {
	return { role, content: parts as any }
}

export function toRichText(text: string): TextPart {
	return {
		type: "text",
		text,
	}
}
