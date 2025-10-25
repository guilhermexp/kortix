"use client"

exports.__esModule = true
exports.usePostHog = exports.PostHogProvider = void 0
var noop = () => {
	var _args = []
	for (var _i = 0; _i < arguments.length; _i++) {
		_args[_i] = arguments[_i]
	}
}
var noopPosthog = {
	capture: noop,
	identify: noop,
	reset: noop,
	opt_in_capturing: noop,
	opt_out_capturing: noop,
	flush: noop,
}
function PostHogProvider(_a) {
	var children = _a.children
	return <>{children}</>
}
exports.PostHogProvider = PostHogProvider
function usePostHog() {
	return noopPosthog
}
exports.usePostHog = usePostHog
