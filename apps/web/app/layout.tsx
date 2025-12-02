import type { Metadata, Viewport } from "next"
import { Inter, JetBrains_Mono } from "next/font/google"
import "../globals.css"
import "@ui/globals.css"
import { AuthProvider } from "@lib/auth-context"
import { APP_URL } from "@lib/env"
import { ErrorTrackingProvider } from "@lib/error-tracking"
import { QueryProvider } from "@/components/providers/query-provider"
import { Suspense } from "react"
import { Toaster } from "sonner"
import { ErrorBoundary } from "@/components/error-boundary"
import { ThemeProvider } from "@/components/providers/theme-provider"
import { MobilePanelProvider } from "@/lib/mobile-panel-context"
import { ViewModeProvider } from "@/lib/view-mode-context"

const sans = Inter({
	subsets: ["latin"],
	variable: "--font-sans",
	display: "swap", // Prevent font preload warnings
	preload: true,
})

const mono = JetBrains_Mono({
	subsets: ["latin"],
	variable: "--font-mono",
	display: "swap", // Prevent font preload warnings
	preload: false, // Only preload primary font
})

const metadataBase = (() => {
	try {
		return new URL(APP_URL)
	} catch {
		return new URL("http://localhost:3000")
	}
})()

export const viewport: Viewport = {
	width: "device-width",
	initialScale: 1,
	maximumScale: 5,
	userScalable: true,
}

export const metadata: Metadata = {
	metadataBase,
	description: "Kortix - Your memory, accessible and private",
	title: {
		default: "Kortix",
		template: "%s | Kortix",
	},
	icons: {
		icon: [
			{ url: "/favicon.svg", type: "image/svg+xml" },
			{ url: "/icon.svg", type: "image/svg+xml" },
		],
		apple: "/icon.svg",
	},
	manifest: "/manifest.json",
	openGraph: {
		title: "Kortix",
		description: "Your memory, accessible and private",
		type: "website",
		locale: "pt_BR",
	},
}

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode
}>) {
	return (
		<html lang="en" suppressHydrationWarning>
			<body className={`${sans.variable} ${mono.variable} antialiased`}>
				<ThemeProvider
					attribute="class"
					defaultTheme="dark"
					disableTransitionOnChange
					enableSystem={false}
				>
					<QueryProvider>
						<AuthProvider>
							<ViewModeProvider>
								<MobilePanelProvider>
									<ErrorTrackingProvider>
										<ErrorBoundary>
											<Suspense>{children}</Suspense>
										</ErrorBoundary>
										<Toaster richColors />
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
