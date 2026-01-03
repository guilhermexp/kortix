"use client"

/**
 * QueryProvider - Provides React Query context to the application
 * Build: 2025-12-02-v5
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { type ReactNode, useState } from "react"

export function QueryProvider({ children }: { children: ReactNode }) {
	const [queryClient] = useState(
		() =>
			new QueryClient({
				defaultOptions: {
					queries: {
						refetchIntervalInBackground: false,
						refetchOnWindowFocus: false,
						staleTime: 60 * 1000,
						retry: 1,
					},
				},
			}),
	)

	return (
		<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
	)
}
