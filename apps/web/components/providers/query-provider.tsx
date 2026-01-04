"use client"

/**
 * QueryProvider - Provides React Query context to the application
 * Build: 2025-01-04-v8 - Fixed for Next.js App Router SSR/hydration
 * Force Railway rebuild
 *
 * Uses the recommended pattern from TanStack Query docs:
 * - Server: always create a new QueryClient per request
 * - Browser: reuse a singleton QueryClient
 * - Avoid useState to prevent issues with React Suspense
 */
import {
	isServer,
	QueryClient,
	QueryClientProvider,
} from "@tanstack/react-query"
import type { ReactNode } from "react"

function makeQueryClient() {
	return new QueryClient({
		defaultOptions: {
			queries: {
				refetchIntervalInBackground: false,
				refetchOnWindowFocus: false,
				staleTime: 60 * 1000,
				retry: 1,
			},
		},
	})
}

let browserQueryClient: QueryClient | undefined = undefined

function getQueryClient() {
	if (isServer) {
		// Server: always make a new query client
		return makeQueryClient()
	}
	// Browser: make a new query client if we don't already have one
	// This is very important, so we don't re-make a new client if React
	// suspends during the initial render
	if (!browserQueryClient) browserQueryClient = makeQueryClient()
	return browserQueryClient
}

export function QueryProvider({ children }: { children: ReactNode }) {
	// NOTE: Avoid useState when initializing the query client if you don't
	//       have a suspense boundary between this and the code that may
	//       suspend because React will throw away the client on the initial
	//       render if it suspends and there is no boundary
	const queryClient = getQueryClient()

	return (
		<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
	)
}
