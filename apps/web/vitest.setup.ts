import "@testing-library/jest-dom/vitest"
import { cleanup } from "@testing-library/react"
import { afterEach, vi } from "vitest"

// Ensure window is available for all tests
if (typeof window === "undefined") {
	;(global as unknown as { window: Window & typeof globalThis }).window = {} as Window & typeof globalThis
}

// Cleanup after each test
afterEach(() => {
	cleanup()
})

// Mock Next.js router
vi.mock("next/navigation", () => ({
	useRouter() {
		return {
			push: vi.fn(),
			replace: vi.fn(),
			refresh: vi.fn(),
			back: vi.fn(),
			forward: vi.fn(),
			prefetch: vi.fn(),
		}
	},
	useSearchParams() {
		return new URLSearchParams()
	},
	usePathname() {
		return "/"
	},
}))

// Mock environment variables
process.env.NEXT_PUBLIC_BACKEND_URL = "http://localhost:4000"
process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000"
