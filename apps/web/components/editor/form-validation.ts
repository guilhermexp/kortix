/**
 * Form Validation for Editor Components
 *
 * Provides validation utilities for editor forms with
 * comprehensive error states and user-friendly messages.
 */

import { z } from "zod"

/**
 * Document content validation schema
 */
export const documentContentSchema = z.object({
	title: z
		.string()
		.min(1, "Title is required")
		.max(500, "Title must be less than 500 characters")
		.optional(),
	content: z
		.string()
		.min(1, "Content cannot be empty")
		.max(1000000, "Content is too large (max 1MB)"),
	tags: z.array(z.string()).optional(),
})

/**
 * Document metadata validation schema
 */
export const documentMetadataSchema = z.object({
	title: z
		.string()
		.min(1, "Title is required")
		.max(500, "Title must be less than 500 characters"),
	description: z
		.string()
		.max(2000, "Description must be less than 2000 characters")
		.optional(),
	tags: z
		.array(
			z
				.string()
				.min(1, "Tag cannot be empty")
				.max(50, "Tag must be less than 50 characters"),
		)
		.max(20, "Maximum 20 tags allowed")
		.optional(),
	spaceId: z.string().uuid("Invalid space ID").optional(),
})

/**
 * Image upload validation schema
 */
export const imageUploadSchema = z.object({
	file: z
		.instanceof(File)
		.refine((file) => file.size <= 10 * 1024 * 1024, {
			message: "Image must be less than 10MB",
		})
		.refine(
			(file) => {
				const validTypes = [
					"image/jpeg",
					"image/png",
					"image/gif",
					"image/webp",
				]
				return validTypes.includes(file.type)
			},
			{
				message: "Only JPEG, PNG, GIF, and WebP images are supported",
			},
		),
})

/**
 * Link validation schema
 */
export const linkSchema = z.object({
	url: z
		.string()
		.url("Invalid URL format")
		.refine(
			(url) => {
				try {
					const parsed = new URL(url)
					return ["http:", "https:"].includes(parsed.protocol)
				} catch {
					return false
				}
			},
			{
				message: "URL must use HTTP or HTTPS protocol",
			},
		),
	title: z
		.string()
		.max(500, "Title must be less than 500 characters")
		.optional(),
})

/**
 * Search query validation schema
 */
export const searchQuerySchema = z.object({
	query: z
		.string()
		.min(1, "Search query cannot be empty")
		.max(500, "Search query must be less than 500 characters"),
	limit: z
		.number()
		.int("Limit must be an integer")
		.min(1, "Limit must be at least 1")
		.max(100, "Limit cannot exceed 100")
		.optional(),
})

/**
 * Validation result type
 */
export type ValidationResult<T> =
	| { success: true; data: T; errors: null }
	| { success: false; data: null; errors: Record<string, string[]> }

/**
 * Validate data against a Zod schema
 */
export function validate<T>(
	schema: z.ZodSchema<T>,
	data: unknown,
): ValidationResult<T> {
	const result = schema.safeParse(data)

	if (result.success) {
		return {
			success: true,
			data: result.data,
			errors: null,
		}
	}

	// Format Zod errors into a more user-friendly structure
	const errors: Record<string, string[]> = {}

	result.error.issues.forEach((issue) => {
		const path = issue.path.join(".")
		if (!errors[path]) {
			errors[path] = []
		}
		errors[path].push(issue.message)
	})

	return {
		success: false,
		data: null,
		errors,
	}
}

/**
 * Validation error state
 */
export interface ValidationError {
	field: string
	message: string
}

/**
 * Convert validation errors to array format
 */
export function getValidationErrors(
	errors: Record<string, string[]>,
): ValidationError[] {
	return Object.entries(errors).flatMap(([field, messages]) =>
		messages.map((message) => ({ field, message })),
	)
}

/**
 * Get first error message for a field
 */
export function getFieldError(
	errors: Record<string, string[]> | null,
	field: string,
): string | null {
	if (!errors || !errors[field]) return null
	return errors[field][0] || null
}

/**
 * Check if field has error
 */
export function hasFieldError(
	errors: Record<string, string[]> | null,
	field: string,
): boolean {
	return !!(errors && errors[field] && errors[field].length > 0)
}

/**
 * Client-side validation helpers
 */

/**
 * Validate document title
 */
export function validateTitle(title: string): string | null {
	if (!title.trim()) {
		return "Title is required"
	}
	if (title.length > 500) {
		return "Title must be less than 500 characters"
	}
	return null
}

/**
 * Validate document content
 */
export function validateContent(content: string): string | null {
	if (!content.trim()) {
		return "Content cannot be empty"
	}
	if (content.length > 1000000) {
		return "Content is too large (max 1MB)"
	}
	return null
}

/**
 * Validate tag
 */
export function validateTag(tag: string): string | null {
	if (!tag.trim()) {
		return "Tag cannot be empty"
	}
	if (tag.length > 50) {
		return "Tag must be less than 50 characters"
	}
	return null
}

/**
 * Validate URL
 */
export function validateUrl(url: string): string | null {
	try {
		const parsed = new URL(url)
		if (!["http:", "https:"].includes(parsed.protocol)) {
			return "URL must use HTTP or HTTPS protocol"
		}
		return null
	} catch {
		return "Invalid URL format"
	}
}

/**
 * Validate image file
 */
export function validateImageFile(file: File): string | null {
	const validTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"]

	if (!validTypes.includes(file.type)) {
		return "Only JPEG, PNG, GIF, and WebP images are supported"
	}

	if (file.size > 10 * 1024 * 1024) {
		return "Image must be less than 10MB"
	}

	return null
}

/**
 * Debounced validation hook helper
 */
export function debounce<T extends (...args: any[]) => any>(
	func: T,
	wait: number,
): (...args: Parameters<T>) => void {
	let timeout: NodeJS.Timeout | null = null

	return (...args: Parameters<T>) => {
		if (timeout) {
			clearTimeout(timeout)
		}
		timeout = setTimeout(() => {
			func(...args)
		}, wait)
	}
}
