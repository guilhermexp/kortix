import { BACKEND_URL } from "@lib/env"

/**
 * Upload an image file to SuperMemory storage
 * @param file - The image file to upload
 * @returns The URL of the uploaded image
 */
export async function uploadImage(file: File): Promise<string> {
	try {
		// Create a unique filename
		const timestamp = Date.now()
		const randomStr = Math.random().toString(36).substring(7)
		const extension = file.name.split(".").pop() || "png"
		const filename = `editor-images/${timestamp}-${randomStr}.${extension}`

		// Create form data
		const formData = new FormData()
		formData.append("file", file)
		formData.append("path", filename)

		// Upload to backend
		const response = await fetch(`${BACKEND_URL}/v3/upload/image`, {
			method: "POST",
			body: formData,
			credentials: "include",
		})

		if (!response.ok) {
			throw new Error(`Upload failed: ${response.statusText}`)
		}

		const data = await response.json()

		if (data.error) {
			throw new Error(data.error.message || "Upload failed")
		}

		// Return the image URL
		return data.url || data.data?.url
	} catch (error) {
		console.error("Error uploading image:", error)
		throw error
	}
}

/**
 * Validate image file
 * @param file - The file to validate
 * @returns true if valid, throws error if invalid
 */
export function validateImageFile(file: File): boolean {
	const maxSize = 10 * 1024 * 1024 // 10MB
	const allowedTypes = [
		"image/jpeg",
		"image/jpg",
		"image/png",
		"image/gif",
		"image/webp",
	]

	if (!allowedTypes.includes(file.type)) {
		throw new Error(
			`Invalid file type: ${file.type}. Allowed types: ${allowedTypes.join(", ")}`,
		)
	}

	if (file.size > maxSize) {
		throw new Error(
			`File too large: ${(file.size / 1024 / 1024).toFixed(2)}MB. Maximum size: 10MB`,
		)
	}

	return true
}
