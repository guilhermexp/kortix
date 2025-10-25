import { renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { useUnsavedChanges } from "./use-unsaved-changes"

describe("useUnsavedChanges", () => {
	beforeEach(() => {
		// Mock window methods before each test
		vi.spyOn(window, "addEventListener")
		vi.spyOn(window, "removeEventListener")
		vi.spyOn(window, "confirm").mockReturnValue(true)
	})

	afterEach(() => {
		vi.restoreAllMocks()
	})

	it("should add beforeunload listener when hasUnsavedChanges is true", () => {
		renderHook(() =>
			useUnsavedChanges({
				hasUnsavedChanges: true,
			}),
		)

		expect(window.addEventListener).toHaveBeenCalledWith(
			"beforeunload",
			expect.any(Function),
		)
	})

	it("should remove beforeunload listener on unmount", () => {
		const { unmount } = renderHook(() =>
			useUnsavedChanges({
				hasUnsavedChanges: true,
			}),
		)

		unmount()

		expect(window.removeEventListener).toHaveBeenCalledWith(
			"beforeunload",
			expect.any(Function),
		)
	})

	it("should not prevent navigation when hasUnsavedChanges is false", () => {
		const { result } = renderHook(() =>
			useUnsavedChanges({
				hasUnsavedChanges: false,
			}),
		)

		const shouldNavigate = result.current.confirmNavigation()

		expect(shouldNavigate).toBe(true)
		expect(window.confirm).not.toHaveBeenCalled()
	})

	it("should show confirm dialog when hasUnsavedChanges is true and user tries to navigate", () => {
		vi.mocked(window.confirm).mockReturnValue(true)

		const { result } = renderHook(() =>
			useUnsavedChanges({
				hasUnsavedChanges: true,
			}),
		)

		const shouldNavigate = result.current.confirmNavigation()

		expect(window.confirm).toHaveBeenCalledWith(
			"You have unsaved changes. Are you sure you want to leave?",
		)
		expect(shouldNavigate).toBe(true)
	})

	it("should prevent navigation when user cancels confirm dialog", () => {
		vi.mocked(window.confirm).mockReturnValue(false)

		const { result } = renderHook(() =>
			useUnsavedChanges({
				hasUnsavedChanges: true,
			}),
		)

		const shouldNavigate = result.current.confirmNavigation()

		expect(window.confirm).toHaveBeenCalled()
		expect(shouldNavigate).toBe(false)
	})

	it("should use custom message when provided", () => {
		vi.mocked(window.confirm).mockReturnValue(true)

		const customMessage = "Custom warning message"
		const { result } = renderHook(() =>
			useUnsavedChanges({
				hasUnsavedChanges: true,
				message: customMessage,
			}),
		)

		result.current.confirmNavigation()

		expect(window.confirm).toHaveBeenCalledWith(customMessage)
	})

	it("should update behavior when hasUnsavedChanges changes", () => {
		const { result, rerender } = renderHook(
			({ hasUnsavedChanges }) =>
				useUnsavedChanges({
					hasUnsavedChanges,
				}),
			{
				initialProps: { hasUnsavedChanges: false },
			},
		)

		// Initially should allow navigation
		expect(result.current.confirmNavigation()).toBe(true)
		expect(window.confirm).not.toHaveBeenCalled()

		// After rerender with unsaved changes
		vi.mocked(window.confirm).mockReturnValue(true)
		rerender({ hasUnsavedChanges: true })

		result.current.confirmNavigation()
		expect(window.confirm).toHaveBeenCalled()
	})

	it("should handle beforeunload event correctly", () => {
		renderHook(() =>
			useUnsavedChanges({
				hasUnsavedChanges: true,
			}),
		)

		// Get the handler that was registered
		const calls = vi.mocked(window.addEventListener).mock.calls
		const beforeunloadCall = calls.find((call) => call[0] === "beforeunload")
		expect(beforeunloadCall).toBeDefined()

		const handler = beforeunloadCall![1] as EventListener

		// Create a mock event
		const mockEvent = {
			preventDefault: vi.fn(),
			returnValue: "",
		} as unknown as BeforeUnloadEvent

		// Call the handler
		const result = handler(mockEvent)

		expect(mockEvent.preventDefault).toHaveBeenCalled()
		expect(mockEvent.returnValue).toBe(
			"You have unsaved changes. Are you sure you want to leave?",
		)
		expect(result).toBe(
			"You have unsaved changes. Are you sure you want to leave?",
		)
	})

	it("should not prevent beforeunload when hasUnsavedChanges is false", () => {
		renderHook(() =>
			useUnsavedChanges({
				hasUnsavedChanges: false,
			}),
		)

		const calls = vi.mocked(window.addEventListener).mock.calls
		const beforeunloadCall = calls.find((call) => call[0] === "beforeunload")
		expect(beforeunloadCall).toBeDefined()

		const handler = beforeunloadCall![1] as EventListener

		const mockEvent = {
			preventDefault: vi.fn(),
			returnValue: "",
		} as unknown as BeforeUnloadEvent

		const result = handler(mockEvent)

		expect(mockEvent.preventDefault).not.toHaveBeenCalled()
		expect(result).toBeUndefined()
	})
})
