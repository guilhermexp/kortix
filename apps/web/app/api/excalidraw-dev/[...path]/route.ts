import { readFile, stat } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { NextResponse } from "next/server"

/**
 * DEV-ONLY: Serve Excalidraw worker and chunk files from node_modules via HTTP.
 *
 * Turbopack resolves `import.meta.url` inside pre-built packages to a `file://`
 * URL. Browsers block `new Worker("file://...")` from an `http://` origin, so
 * Excalidraw's font-subset worker fails with a SecurityError.
 *
 * This route serves those files over HTTP so the patched Worker constructor
 * (see lib/patch-excalidraw-worker.ts) can redirect to them.
 */

let cachedDistDir: string | null = null

async function findExcalidrawDistDir(): Promise<string | null> {
	if (cachedDistDir) return cachedDistDir

	// Try monorepo root node_modules first (bun workspace hoisting),
	// then fall back to local node_modules
	const candidates = [
		resolve(process.cwd(), "../../node_modules/@excalidraw/excalidraw/dist/dev"),
		resolve(process.cwd(), "node_modules/@excalidraw/excalidraw/dist/dev"),
	]

	for (const dir of candidates) {
		try {
			const s = await stat(dir)
			if (s.isDirectory()) {
				cachedDistDir = dir
				return dir
			}
		} catch {
			// try next
		}
	}

	// Last resort: use require.resolve
	try {
		const entryPath = require.resolve("@excalidraw/excalidraw")
		const dir = resolve(dirname(entryPath), "dev")
		const s = await stat(dir)
		if (s.isDirectory()) {
			cachedDistDir = dir
			return dir
		}
	} catch {
		// not found
	}

	return null
}

export async function GET(
	_request: Request,
	{ params }: { params: Promise<{ path: string[] }> },
) {
	if (process.env.NODE_ENV !== "development") {
		return new NextResponse("Not found", { status: 404 })
	}

	const { path } = await params
	const fileName = path.join("/")

	// Security: only allow .js files, no path traversal
	if (fileName.includes("..") || !fileName.endsWith(".js")) {
		return new NextResponse("Forbidden", { status: 403 })
	}

	const distDir = await findExcalidrawDistDir()
	if (!distDir) {
		return new NextResponse("Excalidraw dist not found", { status: 404 })
	}

	const fullPath = resolve(distDir, fileName)

	// Ensure resolved path stays within the dist directory
	if (!fullPath.startsWith(distDir)) {
		return new NextResponse("Forbidden", { status: 403 })
	}

	try {
		const content = await readFile(fullPath, "utf-8")
		return new NextResponse(content, {
			headers: {
				"Content-Type": "application/javascript; charset=utf-8",
				"Cache-Control": "no-store",
			},
		})
	} catch {
		return new NextResponse("Not found", { status: 404 })
	}
}
