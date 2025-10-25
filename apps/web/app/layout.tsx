import type { Metadata } from "next"
import { Inter, JetBrains_Mono } from "next/font/google"
import "../globals.css"
import "@ui/globals.css"
import { AuthProvider } from "@lib/auth-context"
import { APP_URL } from "@lib/env"
import { ErrorTrackingProvider } from "@lib/error-tracking"
import { QueryProvider } from "@lib/query-client"
import { Suspense } from "react"
import { Toaster } from "sonner"
import { TourProvider } from "@/components/tour"
import { MobilePanelProvider } from "@/lib/mobile-panel-context"
import { ThemeProvider } from "@/components/providers/theme-provider"

import { ViewModeProvider } from "@/lib/view-mode-context"

const sans = Inter({
	subsets: ["latin"],
	variable: "--font-sans",
})

const mono = JetBrains_Mono({
	subsets: ["latin"],
	variable: "--font-mono",
})

const metadataBase = (() => {
	try {
		return new URL(APP_URL)
	} catch {
		return new URL("http://localhost:3000")
	}
})()

export const metadata: Metadata = {
	metadataBase,
	description: "Self-hosted Supermemory",
	title: "supermemory",
	viewport: {
		width: "device-width",
		initialScale: 1,
		maximumScale: 5,
		userScalable: true,
	},
}

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode
}>) {
	return (
		<html lang="en" suppressHydrationWarning>
			<body
				className={`${sans.variable} ${mono.variable} antialiased bg-[#0f1419]`}
			>
				<ThemeProvider
					attribute="class"
					defaultTheme="dark"
					enableSystem={false}
					disableTransitionOnChange
				>
					<QueryProvider>
						<AuthProvider>
							<ViewModeProvider>
								<MobilePanelProvider>
									<ErrorTrackingProvider>
										<TourProvider>
											<Suspense>{children}</Suspense>
											<Toaster richColors theme="dark" />
										</TourProvider>
									</ErrorTrackingProvider>
								</MobilePanelProvider>
							</ViewModeProvider>
						</AuthProvider>
					</QueryProvider>
				</ThemeProvider>
			</body>
		</html>
	)
}
