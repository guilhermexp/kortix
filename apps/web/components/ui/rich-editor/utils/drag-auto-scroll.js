var __assign =
	(this && this.__assign) ||
	function () {
		__assign =
			Object.assign ||
			((t) => {
				for (var s, i = 1, n = arguments.length; i < n; i++) {
					s = arguments[i]
					for (var p in s) if (Object.hasOwn(s, p)) t[p] = s[p]
				}
				return t
			})
		return __assign.apply(this, arguments)
	}
exports.__esModule = true
exports.useDragAutoScroll = exports.setupDragAutoScroll = void 0
var react_1 = require("react")
var DEFAULT_CONFIG = {
	scrollZone: 80,
	scrollSpeed: 10,
	enableHorizontal: false,
	enableVertical: true,
}
/**
 * Setup auto-scroll for drag operations
 * Returns a cleanup function to remove event listeners
 */
function setupDragAutoScroll(containerRef, config) {
	if (config === void 0) {
		config = {}
	}
	var finalConfig = __assign(__assign({}, DEFAULT_CONFIG), config)
	var rafId = null
	var isDragging = false
	var lastMouseX = 0
	var lastMouseY = 0
	/**
	 * Auto-scroll logic
	 */
	var autoScroll = () => {
		if (!isDragging || !containerRef.current) {
			rafId = null
			return
		}
		var container = containerRef.current
		var rect = container.getBoundingClientRect()
		var scrollZone = finalConfig.scrollZone
		var scrollSpeed = finalConfig.scrollSpeed
		var enableVertical = finalConfig.enableVertical
		var enableHorizontal = finalConfig.enableHorizontal
		var scrollX = 0
		var scrollY = 0
		// Check vertical scrolling
		if (enableVertical) {
			// Scroll down when near bottom
			if (lastMouseY > rect.bottom - scrollZone) {
				var distance = lastMouseY - (rect.bottom - scrollZone)
				var intensity = Math.min(distance / scrollZone, 1)
				scrollY = scrollSpeed * intensity
			}
			// Scroll up when near top
			else if (lastMouseY < rect.top + scrollZone) {
				var distance = rect.top + scrollZone - lastMouseY
				var intensity = Math.min(distance / scrollZone, 1)
				scrollY = -scrollSpeed * intensity
			}
		}
		// Check horizontal scrolling
		if (enableHorizontal) {
			// Scroll right when near right edge
			if (lastMouseX > rect.right - scrollZone) {
				var distance = lastMouseX - (rect.right - scrollZone)
				var intensity = Math.min(distance / scrollZone, 1)
				scrollX = scrollSpeed * intensity
			}
			// Scroll left when near left edge
			else if (lastMouseX < rect.left + scrollZone) {
				var distance = rect.left + scrollZone - lastMouseX
				var intensity = Math.min(distance / scrollZone, 1)
				scrollX = -scrollSpeed * intensity
			}
		}
		// Perform scroll
		if (scrollX !== 0 || scrollY !== 0) {
			// Try to find the scrollable parent (could be window or a container)
			var scrollableParent = findScrollableParent(container)
			if (scrollableParent === window) {
				window.scrollBy(scrollX, scrollY)
			} else if (scrollableParent instanceof HTMLElement) {
				scrollableParent.scrollLeft += scrollX
				scrollableParent.scrollTop += scrollY
			}
		}
		// Continue animation loop
		rafId = requestAnimationFrame(autoScroll)
	}
	/**
	 * Find the scrollable parent element
	 */
	var findScrollableParent = (element) => {
		var parent = element.parentElement
		while (parent) {
			var style = window.getComputedStyle(parent)
			var isScrollable =
				(style.overflowY === "auto" ||
					style.overflowY === "scroll" ||
					style.overflowX === "auto" ||
					style.overflowX === "scroll") &&
				(parent.scrollHeight > parent.clientHeight ||
					parent.scrollWidth > parent.clientWidth)
			if (isScrollable) {
				return parent
			}
			parent = parent.parentElement
		}
		// Default to window if no scrollable parent found
		return window
	}
	/**
	 * Track mouse movement during drag
	 */
	var handleDragOver = (e) => {
		lastMouseX = e.clientX
		lastMouseY = e.clientY
		// Start auto-scroll loop if not already running
		if (!rafId && isDragging) {
			rafId = requestAnimationFrame(autoScroll)
		}
	}
	/**
	 * Start tracking drag
	 */
	var handleDragStart = () => {
		isDragging = true
	}
	/**
	 * Stop tracking drag
	 */
	var handleDragEnd = () => {
		isDragging = false
		if (rafId) {
			cancelAnimationFrame(rafId)
			rafId = null
		}
	}
	// Attach event listeners
	document.addEventListener("dragstart", handleDragStart)
	document.addEventListener("dragover", handleDragOver)
	document.addEventListener("dragend", handleDragEnd)
	document.addEventListener("drop", handleDragEnd)
	// Return cleanup function
	return () => {
		isDragging = false
		if (rafId) {
			cancelAnimationFrame(rafId)
			rafId = null
		}
		document.removeEventListener("dragstart", handleDragStart)
		document.removeEventListener("dragover", handleDragOver)
		document.removeEventListener("dragend", handleDragEnd)
		document.removeEventListener("drop", handleDragEnd)
	}
}
exports.setupDragAutoScroll = setupDragAutoScroll
/**
 * React hook for drag auto-scroll
 */
function useDragAutoScroll(containerRef, config) {
	var configRef = react_1.default.useRef(config)
	react_1.default.useEffect(() => {
		configRef.current = config
	}, [config])
	react_1.default.useEffect(() => {
		var cleanup = setupDragAutoScroll(containerRef, configRef.current)
		return cleanup
	}, [containerRef])
}
exports.useDragAutoScroll = useDragAutoScroll
// For non-React usage
exports.default = setupDragAutoScroll
