"use client"

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
exports.useInteractionTracking =
	exports.ErrorTrackingProvider =
	exports.useErrorTracking =
		void 0
var navigation_1 = require("next/navigation")
var react_1 = require("react")
var auth_1 = require("./auth")
var posthog_1 = require("./posthog")
function useErrorTracking() {
	var posthog = (0, posthog_1.usePostHog)()
	var session = (0, auth_1.useSession)().data
	var pathname = (0, navigation_1.usePathname)()
	var trackError = (error, context) => {
		var _a, _b
		var errorDetails = __assign(
			{
				error_message: error instanceof Error ? error.message : String(error),
				error_stack: error instanceof Error ? error.stack : undefined,
				error_name: error instanceof Error ? error.name : "Unknown",
				pathname: pathname,
				user_id:
					(_a =
						session === null || session === void 0 ? void 0 : session.user) ===
						null || _a === void 0
						? void 0
						: _a.id,
				user_email:
					(_b =
						session === null || session === void 0 ? void 0 : session.user) ===
						null || _b === void 0
						? void 0
						: _b.email,
				timestamp: new Date().toISOString(),
			},
			context,
		)
		posthog.capture("error_occurred", errorDetails)
	}
	var trackApiError = (error, endpoint, method) => {
		trackError(error, {
			error_type: "api_error",
			api_endpoint: endpoint,
			api_method: method,
		})
	}
	var trackComponentError = (error, componentName) => {
		trackError(error, {
			error_type: "component_error",
			component_name: componentName,
		})
	}
	var trackValidationError = (error, formName, field) => {
		trackError(error, {
			error_type: "validation_error",
			form_name: formName,
			field_name: field,
		})
	}
	return {
		trackError: trackError,
		trackApiError: trackApiError,
		trackComponentError: trackComponentError,
		trackValidationError: trackValidationError,
	}
}
exports.useErrorTracking = useErrorTracking
// Global error boundary component
function ErrorTrackingProvider(_a) {
	var children = _a.children
	var trackError = useErrorTracking().trackError
	;(0, react_1.useEffect)(() => {
		// Global error handler for unhandled errors
		var handleError = (event) => {
			trackError(event.error, {
				error_type: "global_error",
				source: "window_error",
				filename: event.filename,
				lineno: event.lineno,
				colno: event.colno,
			})
		}
		// Global handler for unhandled promise rejections
		var handleUnhandledRejection = (event) => {
			trackError(event.reason, {
				error_type: "unhandled_promise_rejection",
				source: "promise_rejection",
			})
		}
		window.addEventListener("error", handleError)
		window.addEventListener("unhandledrejection", handleUnhandledRejection)
		return () => {
			window.removeEventListener("error", handleError)
			window.removeEventListener("unhandledrejection", handleUnhandledRejection)
		}
	}, [trackError])
	return <>{children}</>
}
exports.ErrorTrackingProvider = ErrorTrackingProvider
// Hook for tracking user interactions
function useInteractionTracking() {
	var posthog = (0, posthog_1.usePostHog)()
	var session = (0, auth_1.useSession)().data
	var pathname = (0, navigation_1.usePathname)()
	var trackInteraction = (action, details) => {
		var _a
		posthog.capture(
			"user_interaction",
			__assign(
				{
					action: action,
					pathname: pathname,
					user_id:
						(_a =
							session === null || session === void 0
								? void 0
								: session.user) === null || _a === void 0
							? void 0
							: _a.id,
					timestamp: new Date().toISOString(),
				},
				details,
			),
		)
	}
	var trackFormSubmission = (formName, success, details) => {
		var _a
		posthog.capture(
			"form_submission",
			__assign(
				{
					form_name: formName,
					success: success,
					pathname: pathname,
					user_id:
						(_a =
							session === null || session === void 0
								? void 0
								: session.user) === null || _a === void 0
							? void 0
							: _a.id,
					timestamp: new Date().toISOString(),
				},
				details,
			),
		)
	}
	var trackButtonClick = (buttonName, context) => {
		trackInteraction("button_click", {
			button_name: buttonName,
			context: context,
		})
	}
	var trackLinkClick = (url, linkText, external) => {
		trackInteraction("link_click", {
			url: url,
			link_text: linkText,
			external: external,
		})
	}
	var trackModalOpen = (modalName) => {
		trackInteraction("modal_open", {
			modal_name: modalName,
		})
	}
	var trackModalClose = (modalName) => {
		trackInteraction("modal_close", {
			modal_name: modalName,
		})
	}
	var trackTabChange = (fromTab, toTab) => {
		trackInteraction("tab_change", {
			from_tab: fromTab,
			to_tab: toTab,
		})
	}
	return {
		trackInteraction: trackInteraction,
		trackFormSubmission: trackFormSubmission,
		trackButtonClick: trackButtonClick,
		trackLinkClick: trackLinkClick,
		trackModalOpen: trackModalOpen,
		trackModalClose: trackModalClose,
		trackTabChange: trackTabChange,
	}
}
exports.useInteractionTracking = useInteractionTracking
