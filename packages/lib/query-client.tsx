"use client"

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { ReactQueryDevtoolsPanel } from "@tanstack/react-query-devtools"
import { useState } from "react"

export const QueryProvider = ({ children }: { children: React.ReactNode }) => {
	const [queryClient] = useState(
		() =>
			new QueryClient({
				defaultOptions: {
					queries: {
						refetchIntervalInBackground: false,
						refetchOnWindowFocus: false,
						staleTime: 60 * 1000,
					},
				},
			}),
	)

	return (
		<QueryClientProvider client={queryClient}>
			{children}
			{process.env.NODE_ENV === "development" && <DevtoolsDock />}
		</QueryClientProvider>
	)
}

function DevtoolsDock() {
	const [open, setOpen] = useState(false)
	return (
		<>
			<button
				onClick={() => setOpen((v) => !v)}
				style={{
					position: "fixed",
					right: 12,
					bottom: 12,
					zIndex: 9999,
					background: "rgba(15,20,25,0.7)",
					color: "white",
					padding: "6px 10px",
					borderRadius: 6,
					border: "1px solid rgba(255,255,255,0.1)",
				}}
			>
				{open ? "Close Devtools" : "Open Devtools"}
			</button>
			{open && (
				<div
					style={{
						position: "fixed",
						right: 12,
						bottom: 48,
						zIndex: 9999,
						width: "min(95vw, 1000px)",
						height: "min(70vh, 600px)",
						boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
						borderRadius: 8,
						overflow: "hidden",
					}}
				>
					<ReactQueryDevtoolsPanel />
				</div>
			)}
		</>
	)
}
