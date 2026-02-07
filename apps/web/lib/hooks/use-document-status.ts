"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { getDocumentStatus } from "@/lib/api/documents-client"

interface DocumentStatus {
	id: string
	status: string
	progress?: number
	error?: string
	[key: string]: any
}

interface UseDocumentStatusOptions {
	/**
	 * Document ID to poll status for
	 */
	documentId: string | null
	/**
	 * Polling interval in milliseconds
	 * @default 2000
	 */
	interval?: number
	/**
	 * Whether to enable polling
	 * @default true
	 */
	enabled?: boolean
	/**
	 * Callback when status changes
	 */
	onStatusChange?: (status: DocumentStatus) => void
	/**
	 * Stop polling when these statuses are reached
	 * @default ["completed", "failed", "cancelled"]
	 */
	stopOnStatus?: string[]
}

interface UseDocumentStatusReturn {
	status: DocumentStatus | null
	isLoading: boolean
	error: Error | null
	refetch: () => Promise<void>
}

/**
 * Hook to poll document processing status
 *
 * @example
 * ```tsx
 * const { status, isLoading, error } = useDocumentStatus({
 *   documentId: "doc-123",
 *   interval: 3000,
 *   onStatusChange: (status) => {
 *     if (status.status === "completed") {
 *       toast.success("Document processed!")
 *     }
 *   }
 * })
 * ```
 */
export function useDocumentStatus({
	documentId,
	interval = 2000,
	enabled = true,
	onStatusChange,
	stopOnStatus = ["completed", "failed", "cancelled"],
}: UseDocumentStatusOptions): UseDocumentStatusReturn {
	const [status, setStatus] = useState<DocumentStatus | null>(null)
	const [isLoading, setIsLoading] = useState<boolean>(false)
	const [error, setError] = useState<Error | null>(null)
	const previousStatusRef = useRef<string | null>(null)

	const fetchStatus = useCallback(async () => {
		if (!documentId) {
			return
		}

		try {
			setIsLoading(true)
			setError(null)

			const data = (await getDocumentStatus(documentId)) as
				| DocumentStatus
				| null
				| undefined
			if (!data) {
				return
			}

			setStatus(data)

			// Call onStatusChange callback if status changed
			if (
				onStatusChange &&
				data?.status &&
				data.status !== previousStatusRef.current
			) {
				onStatusChange(data)
				previousStatusRef.current = data.status
			}
		} catch (err) {
			const errorObj = err instanceof Error ? err : new Error("Unknown error")
			setError(errorObj)
		} finally {
			setIsLoading(false)
		}
	}, [documentId, onStatusChange])

	useEffect(() => {
		if (!enabled || !documentId) {
			return
		}

		// Fetch immediately on mount
		fetchStatus()

		// Set up polling interval
		const intervalId = setInterval(() => {
			// Stop polling if we've reached a terminal status
			if (status?.status && stopOnStatus.includes(status.status)) {
				clearInterval(intervalId)
				return
			}

			fetchStatus()
		}, interval)

		// Cleanup on unmount
		return () => {
			clearInterval(intervalId)
		}
	}, [documentId, enabled, interval, fetchStatus, status?.status, stopOnStatus])

	return {
		status,
		isLoading,
		error,
		refetch: fetchStatus,
	}
}
