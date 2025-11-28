/**
 * Offline Editing Support
 *
 * Provides offline editing capabilities with automatic sync when connection resumes.
 * Features:
 * - Local storage for offline edits
 * - Connection status monitoring
 * - Automatic sync queue
 * - Conflict resolution helpers
 */

import { useCallback, useEffect, useRef, useState } from "react"

export interface OfflineEdit {
	id: string
	documentId: string
	content: string
	timestamp: number
	synced: boolean
	retryCount: number
}

export interface ConnectionStatus {
	isOnline: boolean
	lastOnline: number | null
	reconnectedAt: number | null
}

const STORAGE_KEY_PREFIX = "kortix_offline_"
const SYNC_QUEUE_KEY = `${STORAGE_KEY_PREFIX}sync_queue`
const MAX_RETRY_ATTEMPTS = 3
const RETRY_DELAY = 2000 // 2 seconds

/**
 * Hook to monitor online/offline status
 */
export function useConnectionStatus(): ConnectionStatus {
	const [status, setStatus] = useState<ConnectionStatus>({
		isOnline: typeof window !== "undefined" ? navigator.onLine : true,
		lastOnline: null,
		reconnectedAt: null,
	})

	useEffect(() => {
		if (typeof window === "undefined") return

		const handleOnline = () => {
			setStatus((prev) => ({
				isOnline: true,
				lastOnline: prev.lastOnline,
				reconnectedAt: Date.now(),
			}))
		}

		const handleOffline = () => {
			setStatus((prev) => ({
				isOnline: false,
				lastOnline: Date.now(),
				reconnectedAt: null,
			}))
		}

		window.addEventListener("online", handleOnline)
		window.addEventListener("offline", handleOffline)

		return () => {
			window.removeEventListener("online", handleOnline)
			window.removeEventListener("offline", handleOffline)
		}
	}, [])

	return status
}

/**
 * Local storage manager for offline edits
 */
export class OfflineStorageManager {
	private static getStorageKey(documentId: string): string {
		return `${STORAGE_KEY_PREFIX}doc_${documentId}`
	}

	/**
	 * Save edit to local storage
	 */
	static saveOfflineEdit(documentId: string, content: string): void {
		if (typeof window === "undefined") return

		const edit: OfflineEdit = {
			id: `${documentId}_${Date.now()}`,
			documentId,
			content,
			timestamp: Date.now(),
			synced: false,
			retryCount: 0,
		}

		try {
			const key = OfflineStorageManager.getStorageKey(documentId)
			localStorage.setItem(key, JSON.stringify(edit))
			OfflineStorageManager.addToSyncQueue(edit)
		} catch (error) {
			console.error("Failed to save offline edit:", error)
		}
	}

	/**
	 * Get offline edit for a document
	 */
	static getOfflineEdit(documentId: string): OfflineEdit | null {
		if (typeof window === "undefined") return null

		try {
			const key = OfflineStorageManager.getStorageKey(documentId)
			const stored = localStorage.getItem(key)
			return stored ? JSON.parse(stored) : null
		} catch (error) {
			console.error("Failed to get offline edit:", error)
			return null
		}
	}

	/**
	 * Remove offline edit after successful sync
	 */
	static removeOfflineEdit(documentId: string): void {
		if (typeof window === "undefined") return

		try {
			const key = OfflineStorageManager.getStorageKey(documentId)
			localStorage.removeItem(key)
		} catch (error) {
			console.error("Failed to remove offline edit:", error)
		}
	}

	/**
	 * Add edit to sync queue
	 */
	private static addToSyncQueue(edit: OfflineEdit): void {
		try {
			const queue = OfflineStorageManager.getSyncQueue()
			const existingIndex = queue.findIndex(
				(e) => e.documentId === edit.documentId,
			)

			if (existingIndex >= 0) {
				// Replace existing edit for same document
				queue[existingIndex] = edit
			} else {
				queue.push(edit)
			}

			localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(queue))
		} catch (error) {
			console.error("Failed to add to sync queue:", error)
		}
	}

	/**
	 * Get all pending syncs
	 */
	static getSyncQueue(): OfflineEdit[] {
		if (typeof window === "undefined") return []

		try {
			const stored = localStorage.getItem(SYNC_QUEUE_KEY)
			return stored ? JSON.parse(stored) : []
		} catch (error) {
			console.error("Failed to get sync queue:", error)
			return []
		}
	}

	/**
	 * Update sync queue
	 */
	static updateSyncQueue(queue: OfflineEdit[]): void {
		if (typeof window === "undefined") return

		try {
			localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(queue))
		} catch (error) {
			console.error("Failed to update sync queue:", error)
		}
	}

	/**
	 * Clear all offline data
	 */
	static clearAllOfflineData(): void {
		if (typeof window === "undefined") return

		try {
			const keys = Object.keys(localStorage).filter((key) =>
				key.startsWith(STORAGE_KEY_PREFIX),
			)
			keys.forEach((key) => localStorage.removeItem(key))
		} catch (error) {
			console.error("Failed to clear offline data:", error)
		}
	}
}

/**
 * Hook for offline editing with automatic sync
 */
export function useOfflineEditing(
	documentId: string,
	onSync: (content: string) => Promise<void>,
) {
	const connectionStatus = useConnectionStatus()
	const [isSyncing, setIsSyncing] = useState(false)
	const [syncError, setSyncError] = useState<Error | null>(null)
	const syncTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined)

	/**
	 * Save content for offline editing
	 */
	const saveOffline = useCallback(
		(content: string) => {
			OfflineStorageManager.saveOfflineEdit(documentId, content)
		},
		[documentId],
	)

	/**
	 * Attempt to sync offline edits
	 */
	const syncOfflineEdits = useCallback(async () => {
		if (!connectionStatus.isOnline || isSyncing) return

		const queue = OfflineStorageManager.getSyncQueue()
		const pendingEdit = queue.find((edit) => edit.documentId === documentId)

		if (!pendingEdit) return

		setIsSyncing(true)
		setSyncError(null)

		try {
			await onSync(pendingEdit.content)

			// Mark as synced and remove from storage
			OfflineStorageManager.removeOfflineEdit(documentId)
			const updatedQueue = queue.filter(
				(edit) => edit.documentId !== documentId,
			)
			OfflineStorageManager.updateSyncQueue(updatedQueue)
		} catch (error) {
			console.error("Sync failed:", error)
			setSyncError(error as Error)

			// Increment retry count
			pendingEdit.retryCount += 1

			if (pendingEdit.retryCount < MAX_RETRY_ATTEMPTS) {
				// Schedule retry
				const updatedQueue = queue.map((edit) =>
					edit.documentId === documentId ? pendingEdit : edit,
				)
				OfflineStorageManager.updateSyncQueue(updatedQueue)

				// Retry after delay
				syncTimeoutRef.current = setTimeout(() => {
					syncOfflineEdits()
				}, RETRY_DELAY * pendingEdit.retryCount)
			} else {
				// Max retries reached
				console.error("Max sync retries reached for document:", documentId)
			}
		} finally {
			setIsSyncing(false)
		}
	}, [connectionStatus.isOnline, documentId, isSyncing, onSync])

	/**
	 * Auto-sync when connection is restored
	 */
	useEffect(() => {
		if (connectionStatus.isOnline && connectionStatus.reconnectedAt) {
			// Wait a bit before syncing to ensure stable connection
			const timeout = setTimeout(() => {
				syncOfflineEdits()
			}, 1000)

			return () => clearTimeout(timeout)
		}
	}, [
		connectionStatus.isOnline,
		connectionStatus.reconnectedAt,
		syncOfflineEdits,
	])

	/**
	 * Cleanup timeout on unmount
	 */
	useEffect(() => {
		return () => {
			if (syncTimeoutRef.current) {
				clearTimeout(syncTimeoutRef.current)
			}
		}
	}, [])

	/**
	 * Check for existing offline edits on mount
	 */
	const [hasOfflineEdits, setHasOfflineEdits] = useState(false)

	useEffect(() => {
		const offlineEdit = OfflineStorageManager.getOfflineEdit(documentId)
		setHasOfflineEdits(!!offlineEdit && !offlineEdit.synced)
	}, [documentId])

	return {
		isOnline: connectionStatus.isOnline,
		isSyncing,
		syncError,
		hasOfflineEdits,
		saveOffline,
		syncOfflineEdits,
		getOfflineEdit: () => OfflineStorageManager.getOfflineEdit(documentId),
	}
}

/**
 * Hook to get offline edit status for UI display
 */
export function useOfflineStatus(documentId: string) {
	const connectionStatus = useConnectionStatus()
	const [offlineEdit, setOfflineEdit] = useState<OfflineEdit | null>(null)

	useEffect(() => {
		const edit = OfflineStorageManager.getOfflineEdit(documentId)
		setOfflineEdit(edit)

		// Poll for changes (in case multiple tabs)
		const interval = setInterval(() => {
			const updatedEdit = OfflineStorageManager.getOfflineEdit(documentId)
			setOfflineEdit(updatedEdit)
		}, 5000)

		return () => clearInterval(interval)
	}, [documentId])

	return {
		isOnline: connectionStatus.isOnline,
		hasOfflineChanges: !!offlineEdit && !offlineEdit.synced,
		offlineTimestamp: offlineEdit?.timestamp,
		willSyncWhenOnline: !connectionStatus.isOnline && !!offlineEdit,
	}
}
