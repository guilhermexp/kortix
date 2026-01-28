/**
 * Metadata Change Detector Service
 *
 * Service for detecting metadata changes and triggering reindexing.
 * Features:
 * - Detects changes in extracted metadata (tags, mentions, properties, comments)
 * - Compares old and new metadata to determine if reindexing is needed
 * - Triggers reindexing queue jobs when significant changes are detected
 * - Configurable change detection thresholds
 * - Performance monitoring for detection operations
 */

import { BaseService } from "./base/base-service"
import { addDocumentJob } from "./queue/document-queue"

// ============================================================================
// Types
// ============================================================================

/**
 * Metadata snapshot for comparison
 */
export interface MetadataSnapshot {
	/** Document ID */
	documentId: string
	/** Organization ID */
	orgId: string
	/** Extracted tags */
	tags?: string[]
	/** Extracted @mentions */
	mentions?: string[]
	/** Extracted properties */
	properties?: Record<string, unknown>
	/** Extracted comments */
	comments?: string[]
	/** Timestamp of snapshot */
	timestamp: Date
}

/**
 * Change detection result
 */
export interface ChangeDetectionResult {
	/** Whether changes were detected */
	hasChanges: boolean
	/** Whether changes warrant reindexing */
	requiresReindex: boolean
	/** Details of changes detected */
	changes: {
		tagsChanged: boolean
		mentionsChanged: boolean
		propertiesChanged: boolean
		commentsChanged: boolean
	}
	/** Severity of changes (0-1) */
	severity: number
	/** Description of changes */
	description: string
}

/**
 * Options for change detection
 */
export interface ChangeDetectionOptions {
	/** Minimum severity threshold to trigger reindexing (0-1) */
	reindexThreshold?: number
	/** Check tag changes */
	checkTags?: boolean
	/** Check mention changes */
	checkMentions?: boolean
	/** Check property changes */
	checkProperties?: boolean
	/** Check comment changes */
	checkComments?: boolean
	/** Automatically trigger reindexing job if changes detected */
	autoReindex?: boolean
}

/**
 * Metadata change detector service interface
 */
export interface MetadataChangeDetectorService {
	/**
	 * Detect changes between two metadata snapshots
	 */
	detectChanges(
		oldSnapshot: MetadataSnapshot,
		newSnapshot: MetadataSnapshot,
		options?: ChangeDetectionOptions,
	): Promise<ChangeDetectionResult>

	/**
	 * Compare two metadata objects for changes
	 */
	compareMetadata(
		oldMetadata: Record<string, unknown>,
		newMetadata: Record<string, unknown>,
		options?: ChangeDetectionOptions,
	): Promise<ChangeDetectionResult>

	/**
	 * Trigger reindexing job for document
	 */
	triggerReindex(
		documentId: string,
		orgId: string,
		reason?: string,
	): Promise<string | null>

	/**
	 * Check if changes warrant reindexing
	 */
	shouldReindex(result: ChangeDetectionResult, threshold?: number): boolean
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_REINDEX_THRESHOLD = 0.3 // 30% change severity triggers reindex
const DEFAULT_OPTIONS: Required<Omit<ChangeDetectionOptions, "autoReindex">> = {
	reindexThreshold: DEFAULT_REINDEX_THRESHOLD,
	checkTags: true,
	checkMentions: true,
	checkProperties: true,
	checkComments: true,
}

// ============================================================================
// Metadata Change Detector Service Implementation
// ============================================================================

/**
 * Service for detecting metadata changes and triggering reindexing
 */
export class MetadataChangeDetector
	extends BaseService
	implements MetadataChangeDetectorService
{
	private readonly defaultOptions: Required<
		Omit<ChangeDetectionOptions, "autoReindex">
	>

	constructor(options?: Partial<ChangeDetectionOptions>) {
		super("MetadataChangeDetector")
		this.defaultOptions = {
			...DEFAULT_OPTIONS,
			...options,
		}
	}

	// ========================================================================
	// Public API
	// ========================================================================

	/**
	 * Detect changes between two metadata snapshots
	 *
	 * Compares old and new metadata snapshots to identify changes in:
	 * - Tags (added, removed, or modified)
	 * - Mentions (added or removed)
	 * - Properties (added, removed, or value changes)
	 * - Comments (added, removed, or modified)
	 *
	 * @param oldSnapshot - Previous metadata state
	 * @param newSnapshot - Current metadata state
	 * @param options - Change detection options
	 * @returns Change detection result with details and severity
	 *
	 * @example
	 * ```typescript
	 * const result = await detector.detectChanges(oldSnapshot, newSnapshot);
	 * if (result.requiresReindex) {
	 *   await detector.triggerReindex(documentId, orgId);
	 * }
	 * ```
	 */
	async detectChanges(
		oldSnapshot: MetadataSnapshot,
		newSnapshot: MetadataSnapshot,
		options?: ChangeDetectionOptions,
	): Promise<ChangeDetectionResult> {
		this.assertInitialized()

		const tracker = this.performanceMonitor.startOperation("detectChanges")

		try {
			this.logger.debug("Detecting metadata changes", {
				documentId: oldSnapshot.documentId,
			})

			// Validate snapshots are for same document
			if (oldSnapshot.documentId !== newSnapshot.documentId) {
				throw this.createError(
					"VALIDATION_ERROR",
					"Snapshots must be for the same document",
				)
			}

			const opts = { ...this.defaultOptions, ...options }
			const changes = {
				tagsChanged: false,
				mentionsChanged: false,
				propertiesChanged: false,
				commentsChanged: false,
			}

			let changesCount = 0
			const changeDescriptions: string[] = []

			// Check tag changes
			if (opts.checkTags) {
				const tagsChanged = this.arraysHaveChanges(
					oldSnapshot.tags || [],
					newSnapshot.tags || [],
				)
				if (tagsChanged) {
					changes.tagsChanged = true
					changesCount++
					const added = this.getAddedItems(
						oldSnapshot.tags || [],
						newSnapshot.tags || [],
					)
					const removed = this.getRemovedItems(
						oldSnapshot.tags || [],
						newSnapshot.tags || [],
					)
					changeDescriptions.push(`Tags: +${added.length} -${removed.length}`)
				}
			}

			// Check mention changes
			if (opts.checkMentions) {
				const mentionsChanged = this.arraysHaveChanges(
					oldSnapshot.mentions || [],
					newSnapshot.mentions || [],
				)
				if (mentionsChanged) {
					changes.mentionsChanged = true
					changesCount++
					const added = this.getAddedItems(
						oldSnapshot.mentions || [],
						newSnapshot.mentions || [],
					)
					const removed = this.getRemovedItems(
						oldSnapshot.mentions || [],
						newSnapshot.mentions || [],
					)
					changeDescriptions.push(
						`Mentions: +${added.length} -${removed.length}`,
					)
				}
			}

			// Check property changes
			if (opts.checkProperties) {
				const propertiesChanged = this.objectsHaveChanges(
					oldSnapshot.properties || {},
					newSnapshot.properties || {},
				)
				if (propertiesChanged) {
					changes.propertiesChanged = true
					changesCount++
					const added = this.getAddedKeys(
						oldSnapshot.properties || {},
						newSnapshot.properties || {},
					)
					const removed = this.getRemovedKeys(
						oldSnapshot.properties || {},
						newSnapshot.properties || {},
					)
					const modified = this.getModifiedKeys(
						oldSnapshot.properties || {},
						newSnapshot.properties || {},
					)
					changeDescriptions.push(
						`Properties: +${added.length} -${removed.length} ~${modified.length}`,
					)
				}
			}

			// Check comment changes
			if (opts.checkComments) {
				const commentsChanged = this.arraysHaveChanges(
					oldSnapshot.comments || [],
					newSnapshot.comments || [],
				)
				if (commentsChanged) {
					changes.commentsChanged = true
					changesCount++
					const added = this.getAddedItems(
						oldSnapshot.comments || [],
						newSnapshot.comments || [],
					)
					const removed = this.getRemovedItems(
						oldSnapshot.comments || [],
						newSnapshot.comments || [],
					)
					changeDescriptions.push(
						`Comments: +${added.length} -${removed.length}`,
					)
				}
			}

			// Calculate severity (0-1 scale)
			const totalChecks = [
				opts.checkTags,
				opts.checkMentions,
				opts.checkProperties,
				opts.checkComments,
			].filter(Boolean).length

			const severity = totalChecks > 0 ? changesCount / totalChecks : 0

			const hasChanges = changesCount > 0
			const requiresReindex = hasChanges && severity >= opts.reindexThreshold

			const description =
				changeDescriptions.length > 0
					? changeDescriptions.join("; ")
					: "No changes detected"

			const result: ChangeDetectionResult = {
				hasChanges,
				requiresReindex,
				changes,
				severity,
				description,
			}

			// Auto-trigger reindexing if enabled
			if (options?.autoReindex && requiresReindex) {
				await this.triggerReindex(
					newSnapshot.documentId,
					newSnapshot.orgId,
					description,
				)
			}

			this.logger.debug("Change detection completed", {
				documentId: oldSnapshot.documentId,
				hasChanges,
				requiresReindex,
				severity,
			})

			tracker.end(true)
			return result
		} catch (error) {
			tracker.end(false)
			throw this.handleError(error, "detectChanges")
		}
	}

	/**
	 * Compare two metadata objects for changes
	 *
	 * Convenience method that extracts metadata snapshots from metadata objects
	 * and performs change detection.
	 *
	 * @param oldMetadata - Previous metadata object
	 * @param newMetadata - Current metadata object
	 * @param options - Change detection options
	 * @returns Change detection result
	 */
	async compareMetadata(
		oldMetadata: Record<string, unknown>,
		newMetadata: Record<string, unknown>,
		options?: ChangeDetectionOptions,
	): Promise<ChangeDetectionResult> {
		this.assertInitialized()

		// Extract snapshots from metadata objects
		const oldSnapshot = this.extractSnapshot(oldMetadata)
		const newSnapshot = this.extractSnapshot(newMetadata)

		return this.detectChanges(oldSnapshot, newSnapshot, options)
	}

	/**
	 * Trigger reindexing job for document
	 *
	 * Adds a reindexing job to the document processing queue.
	 * The job will re-extract metadata and update embeddings if needed.
	 *
	 * @param documentId - Document to reindex
	 * @param orgId - Organization ID
	 * @param reason - Optional reason for reindexing
	 * @returns Job ID if queued, null if Redis unavailable
	 */
	async triggerReindex(
		documentId: string,
		orgId: string,
		reason?: string,
	): Promise<string | null> {
		this.assertInitialized()

		const tracker = this.performanceMonitor.startOperation("triggerReindex")

		try {
			this.validateRequired(documentId, "documentId")
			this.validateRequired(orgId, "orgId")

			this.logger.info("Triggering reindexing job", {
				documentId,
				orgId,
				reason,
			})

			// Add job to queue with reindex payload
			const jobId = await addDocumentJob(documentId, orgId, undefined, {
				type: "reindex-metadata",
				reason: reason || "Metadata changed",
				timestamp: new Date().toISOString(),
			})

			if (jobId) {
				this.logger.info("Reindexing job queued", {
					jobId,
					documentId,
					orgId,
				})
			} else {
				this.logger.warn("Reindexing job not queued - Redis unavailable", {
					documentId,
					orgId,
				})
			}

			tracker.end(true)
			return jobId
		} catch (error) {
			tracker.end(false)
			throw this.handleError(error, "triggerReindex")
		}
	}

	/**
	 * Check if changes warrant reindexing
	 *
	 * @param result - Change detection result
	 * @param threshold - Optional custom threshold (0-1)
	 * @returns True if reindexing should be triggered
	 */
	shouldReindex(result: ChangeDetectionResult, threshold?: number): boolean {
		const effectiveThreshold = threshold ?? this.defaultOptions.reindexThreshold
		return result.hasChanges && result.severity >= effectiveThreshold
	}

	// ========================================================================
	// Private Helper Methods
	// ========================================================================

	/**
	 * Extract metadata snapshot from metadata object
	 */
	private extractSnapshot(metadata: Record<string, unknown>): MetadataSnapshot {
		const extracted = (metadata.extracted as Record<string, unknown>) || {}

		return {
			documentId: (metadata.documentId as string) || "unknown",
			orgId: (metadata.orgId as string) || "unknown",
			tags: Array.isArray(extracted.tags) ? (extracted.tags as string[]) : [],
			mentions: Array.isArray(extracted.mentions)
				? (extracted.mentions as string[])
				: [],
			properties:
				extracted.properties && typeof extracted.properties === "object"
					? (extracted.properties as Record<string, unknown>)
					: {},
			comments: Array.isArray(extracted.comments)
				? (extracted.comments as string[])
				: [],
			timestamp: new Date(),
		}
	}

	/**
	 * Check if two arrays have changes
	 */
	private arraysHaveChanges(oldArray: string[], newArray: string[]): boolean {
		if (oldArray.length !== newArray.length) return true

		const oldSet = new Set(oldArray)
		const newSet = new Set(newArray)

		// Check if any items were added or removed
		for (const item of oldArray) {
			if (!newSet.has(item)) return true
		}
		for (const item of newArray) {
			if (!oldSet.has(item)) return true
		}

		return false
	}

	/**
	 * Get items added to array
	 */
	private getAddedItems(oldArray: string[], newArray: string[]): string[] {
		const oldSet = new Set(oldArray)
		return newArray.filter((item) => !oldSet.has(item))
	}

	/**
	 * Get items removed from array
	 */
	private getRemovedItems(oldArray: string[], newArray: string[]): string[] {
		const newSet = new Set(newArray)
		return oldArray.filter((item) => !newSet.has(item))
	}

	/**
	 * Check if two objects have changes
	 */
	private objectsHaveChanges(
		oldObj: Record<string, unknown>,
		newObj: Record<string, unknown>,
	): boolean {
		const oldKeys = Object.keys(oldObj)
		const newKeys = Object.keys(newObj)

		// Check if keys changed
		if (oldKeys.length !== newKeys.length) return true

		const oldKeySet = new Set(oldKeys)
		const newKeySet = new Set(newKeys)

		for (const key of oldKeys) {
			if (!newKeySet.has(key)) return true
		}
		for (const key of newKeys) {
			if (!oldKeySet.has(key)) return true
		}

		// Check if values changed
		for (const key of oldKeys) {
			if (!this.valuesEqual(oldObj[key], newObj[key])) {
				return true
			}
		}

		return false
	}

	/**
	 * Get keys added to object
	 */
	private getAddedKeys(
		oldObj: Record<string, unknown>,
		newObj: Record<string, unknown>,
	): string[] {
		const oldKeys = new Set(Object.keys(oldObj))
		return Object.keys(newObj).filter((key) => !oldKeys.has(key))
	}

	/**
	 * Get keys removed from object
	 */
	private getRemovedKeys(
		oldObj: Record<string, unknown>,
		newObj: Record<string, unknown>,
	): string[] {
		const newKeys = new Set(Object.keys(newObj))
		return Object.keys(oldObj).filter((key) => !newKeys.has(key))
	}

	/**
	 * Get keys with modified values
	 */
	private getModifiedKeys(
		oldObj: Record<string, unknown>,
		newObj: Record<string, unknown>,
	): string[] {
		const commonKeys = Object.keys(oldObj).filter((key) =>
			Object.hasOwn(newObj, key),
		)
		return commonKeys.filter(
			(key) => !this.valuesEqual(oldObj[key], newObj[key]),
		)
	}

	/**
	 * Deep equality check for values
	 */
	private valuesEqual(a: unknown, b: unknown): boolean {
		if (a === b) return true
		if (a === null || b === null) return false
		if (a === undefined || b === undefined) return false

		// Handle arrays
		if (Array.isArray(a) && Array.isArray(b)) {
			if (a.length !== b.length) return false
			return a.every((item, i) => this.valuesEqual(item, b[i]))
		}

		// Handle objects
		if (typeof a === "object" && typeof b === "object") {
			const aKeys = Object.keys(a as Record<string, unknown>)
			const bKeys = Object.keys(b as Record<string, unknown>)
			if (aKeys.length !== bKeys.length) return false

			return aKeys.every((key) =>
				this.valuesEqual(
					(a as Record<string, unknown>)[key],
					(b as Record<string, unknown>)[key],
				),
			)
		}

		// Scalar comparison
		return false
	}
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new metadata change detector service
 */
export function createMetadataChangeDetector(
	options?: Partial<ChangeDetectionOptions>,
): MetadataChangeDetector {
	return new MetadataChangeDetector(options)
}
