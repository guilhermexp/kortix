import { useEffect, useRef, useCallback, useState } from "react";
import { editorContentToText } from "@/lib/editor/content-conversion";
import { updateDocumentContent } from "@/lib/api/documents-client";
import type { ContainerNode } from "@/components/ui/rich-editor";
import { toast } from "sonner";
import {
	useConnectionStatus,
	OfflineStorageManager,
} from "./offline-support";

interface AutoSaveOptions {
	documentId: string;
	content: ContainerNode | undefined;
	enabled?: boolean;
	delayMs?: number;
	onSaveStart?: () => void;
	onSaveComplete?: () => void;
	onSaveError?: (error: Error) => void;
}

export type SaveStatus = "idle" | "pending" | "saving" | "saved" | "error" | "offline";

export function useAutoSave({
	documentId,
	content,
	enabled = true,
	delayMs = 2000, // 2 seconds default
	onSaveStart,
	onSaveComplete,
	onSaveError,
}: AutoSaveOptions) {
	const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
	const [lastSaved, setLastSaved] = useState<Date | null>(null);
	const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
	const isSavingRef = useRef(false);
	const lastContentRef = useRef<string>("");
	const connectionStatus = useConnectionStatus();

	const save = useCallback(async () => {
		if (!content || isSavingRef.current) {
			return;
		}

		const textContent = editorContentToText(content);

		// Only save if content has changed
		if (textContent === lastContentRef.current) {
			setSaveStatus("saved");
			return;
		}

		// If offline, save to local storage
		if (!connectionStatus.isOnline) {
			OfflineStorageManager.saveOfflineEdit(documentId, textContent);
			lastContentRef.current = textContent;
			setSaveStatus("offline");
			toast.info("Saved offline - will sync when connection resumes", {
				duration: 3000,
			});
			return;
		}

		try {
			isSavingRef.current = true;
			setSaveStatus("saving");
			onSaveStart?.();

			await updateDocumentContent(documentId, textContent);

			// Clear any offline edits after successful save
			OfflineStorageManager.removeOfflineEdit(documentId);

			lastContentRef.current = textContent;
			setLastSaved(new Date());
			setSaveStatus("saved");
			onSaveComplete?.();

			// Reset to idle after 3 seconds
			setTimeout(() => {
				setSaveStatus("idle");
			}, 3000);
		} catch (error) {
			console.error("Auto-save error:", error);

			// Save offline as fallback
			OfflineStorageManager.saveOfflineEdit(documentId, textContent);
			lastContentRef.current = textContent;

			setSaveStatus("error");
			onSaveError?.(error as Error);
			toast.error("Failed to save - content saved offline", {
				duration: 5000,
			});

			// Reset to idle after 5 seconds
			setTimeout(() => {
				setSaveStatus("idle");
			}, 5000);
		} finally {
			isSavingRef.current = false;
		}
	}, [content, documentId, connectionStatus.isOnline, onSaveStart, onSaveComplete, onSaveError]);

	// Auto-save effect
	useEffect(() => {
		if (!enabled || !content) {
			return;
		}

		// Clear existing timeout
		if (saveTimeoutRef.current) {
			clearTimeout(saveTimeoutRef.current);
		}

		// Mark as pending
		setSaveStatus("pending");

		// Schedule save
		saveTimeoutRef.current = setTimeout(() => {
			save();
		}, delayMs);

		return () => {
			if (saveTimeoutRef.current) {
				clearTimeout(saveTimeoutRef.current);
			}
		};
	}, [content, enabled, delayMs, save]);

	// Sync offline edits when connection is restored
	useEffect(() => {
		if (connectionStatus.isOnline && connectionStatus.reconnectedAt) {
			const offlineEdit = OfflineStorageManager.getOfflineEdit(documentId);
			if (offlineEdit && !offlineEdit.synced) {
				// Trigger sync after a short delay to ensure stable connection
				const syncTimeout = setTimeout(async () => {
					try {
						setSaveStatus("saving");
						await updateDocumentContent(documentId, offlineEdit.content);

						// Clear offline edit after successful sync
						OfflineStorageManager.removeOfflineEdit(documentId);
						setLastSaved(new Date());
						setSaveStatus("saved");

						toast.success("Offline changes synced successfully");

						setTimeout(() => {
							setSaveStatus("idle");
						}, 3000);
					} catch (error) {
						console.error("Failed to sync offline edits:", error);
						setSaveStatus("error");
						toast.error("Failed to sync offline changes");
					}
				}, 1000);

				return () => clearTimeout(syncTimeout);
			}
		}
	}, [connectionStatus.isOnline, connectionStatus.reconnectedAt, documentId]);

	// Cleanup on unmount
	useEffect(() => {
		return () => {
			if (saveTimeoutRef.current) {
				clearTimeout(saveTimeoutRef.current);
			}
		};
	}, []);

	const forceSave = useCallback(() => {
		if (saveTimeoutRef.current) {
			clearTimeout(saveTimeoutRef.current);
		}
		save();
	}, [save]);

	return {
		saveStatus,
		lastSaved,
		forceSave,
		isOnline: connectionStatus.isOnline,
	};
}
