import { type NextRequest, NextResponse } from "next/server"

// Types for FAL actions
type FalAction =
	| "text-to-image" // Texto → Imagem (Flux Schnell)
	| "image-to-image" // Imagem + Texto → Nova imagem (Flux Dev)
	| "inpaint" // Imagem + Máscara + Texto → Edição (Flux Inpaint)
	| "veo3" // Texto/Imagem → Vídeo (Veo 3)
	| "seedream4_edit" // Imagem + Texto → Nova imagem (ByteDance)
	| "wan2_2" // Texto → Vídeo (YAM 2.2)

export async function POST(req: NextRequest) {
	try {
		const { action, input } = await req.json()

		const FAL_KEY = process.env.FAL_KEY
		if (!FAL_KEY) {
			return NextResponse.json(
				{ error: "FAL_KEY not configured" },
				{ status: 500 },
			)
		}

		// Dynamic import of fal client
		const { fal } = await import("@fal-ai/client")
		fal.config({ credentials: FAL_KEY })

		// TEXT-TO-IMAGE (Flux Schnell)
		if (action === "text-to-image") {
			const result = await fal.subscribe("fal-ai/flux/schnell", {
				input,
			})
			return NextResponse.json({
				images: (result.data as any)?.images?.map((i: any) => i.url) || [],
			})
		}

		// IMAGE-TO-IMAGE (Flux Dev)
		if (action === "image-to-image") {
			const result = await fal.subscribe("fal-ai/flux/dev/image-to-image", {
				input,
			})
			return NextResponse.json({
				images: (result.data as any)?.images?.map((i: any) => i.url) || [],
			})
		}

		// INPAINTING (Flux General)
		if (action === "inpaint") {
			const result = await fal.subscribe("fal-ai/flux-general/inpainting", {
				input,
			})
			return NextResponse.json({
				images: (result.data as any)?.images?.map((i: any) => i.url) || [],
			})
		}

		// SEEDREAM 4 (ByteDance image-to-image)
		if (action === "seedream4_edit") {
			const result = await fal.subscribe("fal-ai/bytedance/seedream/v4/edit", {
				input,
			})
			return NextResponse.json({
				images: (result.data as any)?.images?.map((i: any) => i.url) || [],
			})
		}

		// VEO 3 (video)
		if (action === "veo3") {
			const result = await fal.subscribe("fal-ai/veo3", { input })
			const data = result.data as any
			return NextResponse.json({
				videos: data?.videos?.map((v: any) => v.url) || [data?.video?.url],
			})
		}

		// YAM 2.2 (video)
		if (action === "wan2_2") {
			const result = await fal.subscribe("fal-ai/wan/v2.2-a14b/text-to-video", {
				input,
			})
			return NextResponse.json({
				videos: [(result.data as any)?.video?.url],
			})
		}

		return NextResponse.json({ error: "Unknown action" }, { status: 400 })
	} catch (error) {
		console.error("[FAL API Error]:", error)
		return NextResponse.json(
			{ error: error instanceof Error ? error.message : "Unknown error" },
			{ status: 500 },
		)
	}
}
