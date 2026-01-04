// Force dynamic rendering - disable ISR cache
export const dynamic = "force-dynamic"
export const revalidate = 0

import dynamic from "next/dynamic"

// Use dynamic import with SSR disabled to ensure React Query hooks
// only run on the client where QueryClientProvider is fully initialized
const HomePage = dynamic(() => import("./home-client"), {
	ssr: false,
	loading: () => (
		<div className="min-h-screen flex items-center justify-center bg-background">
			<div className="flex flex-col items-center gap-4">
				<div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
				<p className="text-white/60">Loading...</p>
			</div>
		</div>
	),
})

export default HomePage
