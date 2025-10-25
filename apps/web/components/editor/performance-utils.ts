/**
 * Performance Optimization Utilities for Editor
 *
 * Provides utilities for optimizing editor performance including
 * debouncing, throttling, memoization, and performance monitoring.
 */

import { useCallback, useEffect, useMemo, useRef } from "react"

/**
 * Debounce function - delays execution until after wait time has passed
 * Useful for: auto-save, search input, resize handlers
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

/**
 * Throttle function - ensures function is called at most once per interval
 * Useful for: scroll handlers, resize handlers, frequent events
 */
export function throttle<T extends (...args: any[]) => any>(
	func: T,
	limit: number,
): (...args: Parameters<T>) => void {
	let inThrottle = false

	return (...args: Parameters<T>) => {
		if (!inThrottle) {
			func(...args)
			inThrottle = true
			setTimeout(() => {
				inThrottle = false
			}, limit)
		}
	}
}

/**
 * React hook for debounced values
 * Updates the value only after the specified delay
 */
export function useDebounce<T>(value: T, delay: number): T {
	const [debouncedValue, setDebouncedValue] = React.useState<T>(value)

	React.useEffect(() => {
		const handler = setTimeout(() => {
			setDebouncedValue(value)
		}, delay)

		return () => {
			clearTimeout(handler)
		}
	}, [value, delay])

	return debouncedValue
}

// Fix: Import React for useState
import React from "react"

/**
 * React hook for throttled values
 * Updates the value at most once per interval
 */
export function useThrottle<T>(value: T, interval: number): T {
	const [throttledValue, setThrottledValue] = React.useState<T>(value)
	const lastRan = React.useRef(Date.now())

	React.useEffect(() => {
		const handler = setTimeout(
			() => {
				if (Date.now() - lastRan.current >= interval) {
					setThrottledValue(value)
					lastRan.current = Date.now()
				}
			},
			interval - (Date.now() - lastRan.current),
		)

		return () => {
			clearTimeout(handler)
		}
	}, [value, interval])

	return throttledValue
}

/**
 * Intersection Observer hook for lazy loading
 * Detects when an element enters the viewport
 */
export function useIntersectionObserver(
	elementRef: React.RefObject<Element>,
	options?: IntersectionObserverInit,
): boolean {
	const [isIntersecting, setIsIntersecting] = React.useState(false)

	React.useEffect(() => {
		const element = elementRef.current
		if (!element) return

		const observer = new IntersectionObserver(([entry]) => {
			setIsIntersecting(entry?.isIntersecting ?? false)
		}, options)

		observer.observe(element)

		return () => {
			observer.disconnect()
		}
	}, [elementRef, options])

	return isIntersecting
}

/**
 * Virtual scrolling helper
 * Calculates visible items for large lists
 */
export function useVirtualScroll<T>({
	items,
	itemHeight,
	containerHeight,
	overscan = 3,
}: {
	items: T[]
	itemHeight: number
	containerHeight: number
	overscan?: number
}) {
	const [scrollTop, setScrollTop] = React.useState(0)

	const visibleRange = useMemo(() => {
		const start = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan)
		const end = Math.min(
			items.length,
			Math.ceil((scrollTop + containerHeight) / itemHeight) + overscan,
		)

		return { start, end }
	}, [scrollTop, itemHeight, containerHeight, items.length, overscan])

	const visibleItems = useMemo(() => {
		return items
			.slice(visibleRange.start, visibleRange.end)
			.map((item, index) => ({
				item,
				index: visibleRange.start + index,
				offset: (visibleRange.start + index) * itemHeight,
			}))
	}, [items, visibleRange, itemHeight])

	const totalHeight = items.length * itemHeight

	return {
		visibleItems,
		totalHeight,
		scrollTop,
		setScrollTop,
	}
}

/**
 * Performance measurement hook
 * Measures component render performance
 */
export function usePerformanceMark(componentName: string, enabled = false) {
	const renderCount = useRef(0)

	useEffect(() => {
		if (!enabled) return

		renderCount.current += 1

		if (typeof window !== "undefined" && window.performance) {
			const markName = `${componentName}-render-${renderCount.current}`
			performance.mark(markName)

			return () => {
				try {
					performance.clearMarks(markName)
				} catch (e) {
					// Ignore errors
				}
			}
		}
	})

	const measure = useCallback(
		(startMark: string, endMark: string) => {
			if (!enabled || typeof window === "undefined") return

			try {
				const measureName = `${componentName}-measure`
				performance.measure(measureName, startMark, endMark)

				const measures = performance.getEntriesByName(measureName)
				if (measures.length > 0) {
					const lastMeasure = measures[measures.length - 1]
					if (lastMeasure) {
						console.log(
							`[Performance] ${componentName}: ${lastMeasure.duration.toFixed(2)}ms`,
						)
					}
				}

				performance.clearMeasures(measureName)
			} catch (e) {
				console.error(`[Performance] Error measuring ${componentName}:`, e)
			}
		},
		[componentName, enabled],
	)

	return { renderCount: renderCount.current, measure }
}

/**
 * Memoization with custom equality check
 * More flexible than React.useMemo
 */
export function useDeepMemo<T>(
	factory: () => T,
	deps: any[],
	isEqual: (a: any[], b: any[]) => boolean = shallowEqual,
): T {
	const ref = useRef<{ deps: any[]; value: T } | undefined>(undefined)

	if (!ref.current || !isEqual(deps, ref.current.deps)) {
		ref.current = {
			deps,
			value: factory(),
		}
	}

	return ref.current.value
}

/**
 * Shallow equality check for arrays
 */
function shallowEqual(a: any[], b: any[]): boolean {
	if (a.length !== b.length) return false
	return a.every((val, i) => val === b[i])
}

/**
 * RAF-based throttle for smooth animations
 * Uses requestAnimationFrame for optimal performance
 */
export function rafThrottle<T extends (...args: any[]) => any>(
	func: T,
): (...args: Parameters<T>) => void {
	let rafId: number | null = null

	return (...args: Parameters<T>) => {
		if (rafId !== null) {
			return
		}

		rafId = requestAnimationFrame(() => {
			func(...args)
			rafId = null
		})
	}
}

/**
 * Idle callback hook
 * Executes callback when browser is idle
 */
export function useIdleCallback(
	callback: () => void,
	deps: React.DependencyList = [],
) {
	React.useEffect(() => {
		if (typeof window === "undefined" || !("requestIdleCallback" in window)) {
			// Fallback to setTimeout
			const timeoutId = setTimeout(callback, 1)
			return () => clearTimeout(timeoutId)
		}

		const idleId = requestIdleCallback(callback)
		return () => cancelIdleCallback(idleId)
	}, deps)
}

/**
 * Batch state updates helper
 * Reduces re-renders by batching multiple state updates
 */
export function useBatchedUpdates() {
	const pendingUpdates = useRef<(() => void)[]>([])
	const rafId = useRef<number | null>(null)

	const scheduleUpdate = useCallback((update: () => void) => {
		pendingUpdates.current.push(update)

		if (rafId.current === null) {
			rafId.current = requestAnimationFrame(() => {
				const updates = pendingUpdates.current
				pendingUpdates.current = []
				rafId.current = null

				updates.forEach((update) => update())
			})
		}
	}, [])

	return scheduleUpdate
}

/**
 * Memory-efficient image loading
 * Loads images with proper cleanup
 */
export function useImageLoader(src: string | undefined) {
	const [status, setStatus] = React.useState<"loading" | "loaded" | "error">(
		"loading",
	)

	React.useEffect(() => {
		if (!src) {
			setStatus("error")
			return
		}

		setStatus("loading")

		const img = new Image()

		const handleLoad = () => setStatus("loaded")
		const handleError = () => setStatus("error")

		img.addEventListener("load", handleLoad)
		img.addEventListener("error", handleError)
		img.src = src

		return () => {
			img.removeEventListener("load", handleLoad)
			img.removeEventListener("error", handleError)
		}
	}, [src])

	return status
}

/**
 * Prefetch resources
 * Preloads critical resources for better performance
 */
export function prefetchResource(href: string, as = "fetch") {
	if (typeof document === "undefined") return

	const link = document.createElement("link")
	link.rel = "prefetch"
	link.as = as
	link.href = href

	document.head.appendChild(link)
}

/**
 * Preload images
 * Preloads images for instant display
 */
export function preloadImages(urls: string[]): Promise<void[]> {
	return Promise.all(
		urls.map(
			(url) =>
				new Promise<void>((resolve, reject) => {
					const img = new Image()
					img.onload = () => resolve()
					img.onerror = reject
					img.src = url
				}),
		),
	)
}

/**
 * Check if code splitting is supported
 */
export function supportsCodeSplitting(): boolean {
	return typeof window !== "undefined" && "IntersectionObserver" in window
}
