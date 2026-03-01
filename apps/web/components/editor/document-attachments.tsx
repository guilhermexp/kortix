"use client"

import { BACKEND_URL } from "@lib/env"
import { getColors } from "@repo/ui/memory-graph/constants"
import { Button } from "@repo/ui/components/button"
import {
	Download,
	File,
	FileImage,
	FileJson,
	FileSpreadsheet,
	FileText,
	Paperclip,
	Plus,
	Trash2,
} from "lucide-react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useCallback, useRef } from "react"

interface Attachment {
	id: string
	document_id: string
	filename: string
	mime_type: string
	size_bytes: number
	created_at: string
	downloadUrl?: string
}

function formatFileSize(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function getFileIcon(mimeType: string) {
	if (mimeType.startsWith("image/")) return FileImage
	if (mimeType === "application/json") return FileJson
	if (
		mimeType === "text/csv" ||
		mimeType.includes("spreadsheet") ||
		mimeType.includes("excel")
	)
		return FileSpreadsheet
	if (
		mimeType === "text/plain" ||
		mimeType === "text/markdown" ||
		mimeType === "application/pdf"
	)
		return FileText
	return File
}

const BASE = `${BACKEND_URL.replace(/\/$/, "")}/v3`

async function fetchAttachments(documentId: string): Promise<Attachment[]> {
	const res = await fetch(`${BASE}/documents/${documentId}/attachments`, {
		credentials: "include",
	})
	if (!res.ok) throw new Error("Failed to fetch attachments")
	const json = await res.json()
	return json.attachments ?? []
}

async function uploadAttachmentFn(
	documentId: string,
	file: globalThis.File,
): Promise<Attachment> {
	const form = new FormData()
	form.append("file", file)
	const res = await fetch(`${BASE}/documents/${documentId}/attachments`, {
		method: "POST",
		body: form,
		credentials: "include",
	})
	if (!res.ok) {
		const err = await res.json().catch(() => ({}))
		throw new Error(err?.error?.message ?? "Upload failed")
	}
	return res.json()
}

async function removeAttachment(
	documentId: string,
	attachmentId: string,
): Promise<void> {
	const res = await fetch(
		`${BASE}/documents/${documentId}/attachments/${attachmentId}`,
		{ method: "DELETE", credentials: "include" },
	)
	if (!res.ok) throw new Error("Failed to delete attachment")
}

async function getAttachmentDownloadUrl(
	documentId: string,
	attachmentId: string,
): Promise<string> {
	const res = await fetch(
		`${BASE}/documents/${documentId}/attachments/${attachmentId}`,
		{ credentials: "include" },
	)
	if (!res.ok) throw new Error("Failed to get download URL")
	const json = await res.json()
	return json.downloadUrl
}

export function DocumentAttachments({
	documentId,
}: { documentId: string }) {
	const colors = getColors()
	const inputRef = useRef<HTMLInputElement>(null)
	const queryClient = useQueryClient()

	const { data: attachments = [], isLoading } = useQuery({
		queryKey: ["document-attachments", documentId],
		queryFn: () => fetchAttachments(documentId),
		enabled: !!documentId,
	})

	const uploadMutation = useMutation({
		mutationFn: (file: globalThis.File) =>
			uploadAttachmentFn(documentId, file),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: ["document-attachments", documentId],
			})
		},
	})

	const deleteMutation = useMutation({
		mutationFn: (attachmentId: string) =>
			removeAttachment(documentId, attachmentId),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: ["document-attachments", documentId],
			})
		},
	})

	const handleFileChange = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			const files = e.target.files
			if (!files) return
			for (const file of Array.from(files)) {
				uploadMutation.mutate(file)
			}
			e.target.value = ""
		},
		[uploadMutation],
	)

	const handleDownload = useCallback(
		async (attachmentId: string, filename: string) => {
			try {
				const url = await getAttachmentDownloadUrl(
					documentId,
					attachmentId,
				)
				const a = document.createElement("a")
				a.href = url
				a.target = "_blank"
				a.download = filename
				a.click()
			} catch {
				// silent
			}
		},
		[documentId],
	)

	const count = attachments.length

	return (
		<div className="mt-6">
			{/* Header row — same pattern as RelatedDocumentsPanel */}
			<div
				className="text-sm font-medium mb-3 flex items-center justify-between py-2"
				style={{ color: colors.text.secondary }}
			>
				<div className="flex items-center gap-2">
					<Paperclip className="w-4 h-4" />
					Anexos ({count})
				</div>

				<Button
					size="sm"
					variant="outline"
					className="h-7 px-2 text-xs"
					type="button"
					disabled={uploadMutation.isPending}
					onClick={() => inputRef.current?.click()}
				>
					<Plus className="w-3 h-3" />
					<span>{uploadMutation.isPending ? "Enviando..." : "Adicionar Anexo"}</span>
				</Button>
				<input
					accept="*/*"
					className="hidden"
					multiple
					onChange={handleFileChange}
					ref={inputRef}
					type="file"
				/>
			</div>

			{/* Loading state */}
			{isLoading && (
				<div className="text-sm" style={{ color: colors.text.secondary }}>
					Carregando anexos...
				</div>
			)}

			{/* Empty state */}
			{!isLoading && count === 0 && (
				<div className="text-sm" style={{ color: colors.text.secondary }}>
					Nenhum anexo adicionado.
				</div>
			)}

			{/* Attachment list */}
			{count > 0 && (
				<div className="space-y-1">
					{attachments.map((att) => {
						const Icon = getFileIcon(att.mime_type)
						return (
							<div
								className="group flex items-center gap-2.5 rounded-lg border border-white/10 bg-white/5 px-3 py-2 transition hover:bg-white/10"
								key={att.id}
							>
								<Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
								<div className="min-w-0 flex-1">
									<p
										className="text-sm font-medium truncate"
										style={{ color: colors.text.primary }}
									>
										{att.filename}
									</p>
									<p className="text-[10px] text-muted-foreground">
										{formatFileSize(att.size_bytes)}
									</p>
								</div>
								<div className="flex shrink-0 items-center gap-1 opacity-0 transition group-hover:opacity-100">
									<button
										className="rounded p-1 text-muted-foreground transition hover:text-foreground"
										onClick={() =>
											handleDownload(att.id, att.filename)
										}
										title="Download"
										type="button"
									>
										<Download className="h-3.5 w-3.5" />
									</button>
									<button
										className="rounded p-1 text-muted-foreground transition hover:text-red-400"
										disabled={deleteMutation.isPending}
										onClick={() =>
											deleteMutation.mutate(att.id)
										}
										title="Remover"
										type="button"
									>
										<Trash2 className="h-3.5 w-3.5" />
									</button>
								</div>
							</div>
						)
					})}
				</div>
			)}

			{/* Upload error */}
			{uploadMutation.isError && (
				<div className="mt-2 text-sm text-red-400">
					{uploadMutation.error instanceof Error
						? uploadMutation.error.message
						: "Falha no upload"}
				</div>
			)}
		</div>
	)
}
