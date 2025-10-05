"use client"

import type { ReactNode } from "react"

const noop = (..._args: unknown[]) => {}

const noopPosthog = {
	capture: noop,
	identify: noop,
	reset: noop,
	opt_in_capturing: noop,
	opt_out_capturing: noop,
	flush: noop,
}

export function PostHogProvider({ children }: { children: ReactNode }) {
	return <>{children}</>
}

export function usePostHog() {
	return noopPosthog
}
