"use client"

exports.__esModule = true
exports.QueryProvider = void 0
var react_query_1 = require("@tanstack/react-query")
var react_query_devtools_1 = require("@tanstack/react-query-devtools")
var react_1 = require("react")
var QueryProvider = (_a) => {
	var children = _a.children
	var queryClient = (0, react_1.useState)(
		() =>
			new react_query_1.QueryClient({
				defaultOptions: {
					queries: {
						refetchIntervalInBackground: false,
						refetchOnWindowFocus: false,
						staleTime: 60 * 1000,
					},
				},
			}),
	)[0]
	return (
		<react_query_1.QueryClientProvider client={queryClient}>
			{children}
			{process.env.NODE_ENV === "development" && <DevtoolsDock />}
		</react_query_1.QueryClientProvider>
	)
}
exports.QueryProvider = QueryProvider
function DevtoolsDock() {
	var _a = (0, react_1.useState)(false)
	var open = _a[0]
	var setOpen = _a[1]
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
					<react_query_devtools_1.ReactQueryDevtoolsPanel />
				</div>
			)}
		</>
	)
}
