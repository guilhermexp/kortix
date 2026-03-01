"use client"

import { $fetch } from "@repo/lib/api"
import { ExternalLink, Layout } from "lucide-react"
import Link from "next/link"
import { useEffect, useState } from "react"
import { Spinner } from "../../spinner"

const CANVAS_PREVIEW_TOOLS = new Set([
	"canvas_create_view",
	"canvas_create_flowchart",
	"canvas_create_mindmap",
	"canvas_auto_arrange",
	"canvas_restore_checkpoint",
])

/**
 * Strip MCP prefix (e.g. "mcp__kortix-tools__canvas_create_view" → "canvas_create_view")
 */
export function stripMcpPrefix(toolName: string): string {
	const lastSep = toolName.lastIndexOf("__")
	if (lastSep > 0) return toolName.slice(lastSep + 2)
	return toolName
}

export function isCanvasPreviewToolName(toolName: string): boolean {
	return CANVAS_PREVIEW_TOOLS.has(stripMcpPrefix(toolName))
}

export function extractCanvasId(outputText: string | undefined): string | null {
	if (!outputText) return null
	try {
		const parsed = JSON.parse(outputText)
		if (typeof parsed.canvasId === "string") return parsed.canvasId
	} catch {
		// Try regex fallback for partial JSON
		const match = outputText.match(/"canvasId"\s*:\s*"([^"]+)"/)
		if (match?.[1]) return match[1]
	}
	return null
}

interface CanvasToolPreviewProps {
	canvasId: string
	toolName: string
}

export function CanvasToolPreview({
	canvasId,
	toolName,
}: CanvasToolPreviewProps) {
	const [previewSrc, setPreviewSrc] = useState<string | null>(null)
	const [isLoading, setIsLoading] = useState(true)
	const [error, setError] = useState(false)

	useEffect(() => {
		let cancelled = false

		const fetchPreview = async () => {
			try {
				const response = await $fetch("@get/canvas/:id", {
					params: { id: canvasId },
				})

				if (cancelled) return

				if (response.error) {
					setError(true)
					setIsLoading(false)
					return
				}

				const { preview } = response.data

				if (typeof preview === "string" && preview.length > 0) {
					setPreviewSrc(preview)
				}
			} catch {
				if (!cancelled) setError(true)
			} finally {
				if (!cancelled) setIsLoading(false)
			}
		}

		fetchPreview()
		return () => {
			cancelled = true
		}
	}, [canvasId])

	const friendlyName = stripMcpPrefix(toolName)
		.replace("canvas_", "")
		.replace(/_/g, " ")

	if (isLoading) {
		return (
			<div className="flex items-center gap-2 py-2 text-xs text-zinc-400">
				<Spinner className="size-3" />
				<span>Carregando preview...</span>
			</div>
		)
	}

	if (error) {
		return (
			<Link
				className="inline-flex items-center gap-1.5 py-1 text-xs text-blue-400 hover:text-blue-300 transition-colors"
				href={`/canvas/${canvasId}`}
			>
				<ExternalLink className="size-3" />
				Abrir no Canvas
			</Link>
		)
	}

	return (
		<div className="flex flex-col gap-2">
			{previewSrc ? (
				<Link
					className="block overflow-hidden rounded-lg border border-zinc-700/50 bg-zinc-900 hover:border-zinc-600 transition-colors"
					href={`/canvas/${canvasId}`}
				>
					<img
						alt={`Preview: ${friendlyName}`}
						className="max-h-48 w-full object-contain bg-white"
						src={previewSrc}
					/>
				</Link>
			) : (
				<Link
					className="flex items-center gap-3 rounded-lg border border-zinc-700/50 bg-zinc-900/50 px-4 py-3 hover:border-zinc-600 transition-colors"
					href={`/canvas/${canvasId}`}
				>
					<Layout className="size-5 text-zinc-400" />
					<div className="flex flex-col">
						<span className="text-sm text-zinc-200">
							Diagrama criado
						</span>
						<span className="text-xs text-zinc-500">
							Clique para abrir no Canvas
						</span>
					</div>
				</Link>
			)}
		</div>
	)
}
