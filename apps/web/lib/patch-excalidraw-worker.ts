/**
 * DEV-ONLY: Patch the global Worker constructor so Excalidraw's font-subset
 * worker loads over HTTP instead of the `file://` URL that Turbopack emits.
 *
 * Problem: Turbopack resolves `import.meta.url` inside pre-built node_modules
 * to a `file:///ROOT/…` URL.  Excalidraw exports that URL as `WorkerUrl` and
 * passes it to `new Worker(url, { type: "module" })`.  Browsers reject workers
 * loaded from `file://` when the page is served over `http://`.
 *
 * Solution: Intercept the Worker constructor, detect the file:// URL that
 * points to the Excalidraw dist, and rewrite it to the dev API route that
 * serves the same file over HTTP (see app/api/excalidraw-dev/[...path]/route.ts).
 *
 * In production builds (webpack), the worker URL is resolved correctly, so
 * this patch is a no-op outside development.
 */
if (
	typeof window !== "undefined" &&
	process.env.NODE_ENV === "development"
) {
	const OriginalWorker = window.Worker

	const PatchedWorker = function PatchedWorker(
		this: Worker,
		scriptURL: string | URL,
		options?: WorkerOptions,
	) {
		const href =
			scriptURL instanceof URL ? scriptURL.href : String(scriptURL)

		if (
			href.startsWith("file://") &&
			href.includes("@excalidraw/excalidraw")
		) {
			// Extract file name after dist/dev/ or dist/prod/
			const match = href.match(
				/@excalidraw\/excalidraw\/dist\/(?:dev|prod)\/(.+)$/,
			)
			if (match?.[1]) {
				const httpUrl = `/api/excalidraw-dev/${match[1]}`
				return new OriginalWorker(httpUrl, options) as Worker
			}
		}

		return new OriginalWorker(scriptURL, options) as Worker
	} as unknown as typeof Worker

	// Preserve prototype chain so `instanceof Worker` still works
	PatchedWorker.prototype = OriginalWorker.prototype
	Object.defineProperty(PatchedWorker, "name", { value: "Worker" })

	window.Worker = PatchedWorker

	// Suppress Excalidraw's noisy "Failed to use workers for subsetting" error.
	// This is a harmless dev-only issue: Turbopack resolves import.meta.url to
	// a format the Worker can't use, so Excalidraw falls back to the main thread
	// (which works fine). The console.error fires on every font load and is noise.
	const originalConsoleError = console.error
	console.error = function (...args: unknown[]) {
		if (
			typeof args[0] === "string" &&
			args[0].includes("Failed to use workers for subsetting")
		) {
			return
		}
		return originalConsoleError.apply(console, args)
	}
}
