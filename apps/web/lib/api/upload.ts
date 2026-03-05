const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:4000"

/**
 * Validate image file type and size
 */
export function validateImageFile(file: File): void {
	const validTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"]

	if (!validTypes.includes(file.type)) {
		throw new Error("Only JPEG, PNG, GIF, and WebP images are supported")
	}

	if (file.size > 10 * 1024 * 1024) {
		throw new Error("Image must be less than 10MB")
	}
}

/**
 * Upload an image file and return its URL
 */
export async function uploadImage(file: File): Promise<string> {
	const formData = new FormData()
	formData.append("image", file)

	const response = await fetch(`${BACKEND_URL}/api/upload/image`, {
		method: "POST",
		body: formData,
	})

	if (!response.ok) {
		throw new Error("Upload failed")
	}

	const data = (await response.json()) as { url: string }
	return data.url
}
