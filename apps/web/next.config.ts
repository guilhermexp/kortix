import path from "node:path"
import type { NextConfig } from "next"
import createNextIntlPlugin from "next-intl/plugin"

const workspaceRoot = path.resolve(__dirname, "..", "..")
const withNextIntl = createNextIntlPlugin("./i18n/request.ts")
const isDev = process.env.NODE_ENV !== "production"
const devLocalImageSources = isDev
	? " http://localhost:3000 http://127.0.0.1:3000 http://localhost:3001 http://127.0.0.1:3001"
	: ""
const devLocalConnectSources = isDev
	? " http://localhost:3000 http://127.0.0.1:3000 ws://localhost:3000 ws://127.0.0.1:3000 http://localhost:3001 http://127.0.0.1:3001 ws://localhost:3001 ws://127.0.0.1:3001 http://localhost:4000 http://127.0.0.1:4000 ws://localhost:4000 ws://127.0.0.1:4000"
	: ""
const contentSecurityPolicy =
	`default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://opengraph.githubassets.com https://*.githubusercontent.com https://i.ytimg.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https: blob:${devLocalImageSources}; font-src 'self' data: https://fonts.gstatic.com https://fonts.googleapis.com https://unpkg.com https://r2cdn.perplexity.ai https://esm.sh; connect-src 'self' data: blob:${devLocalConnectSources} https://* wss://*; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; frame-src https://www.youtube.com https://youtube.com https://*.figma.com https://*.google.com https://*.excalidraw.com;`

const nextConfig: NextConfig = {
	// Force new build ID to bust all caches
	generateBuildId: async () => {
		return `build-${Date.now()}`
	},
	// Enable compression for better performance
	compress: true,
	typescript: {
		ignoreBuildErrors: false,
	},
	// Transpile monorepo packages to ensure shared module instances
	// Include @tanstack/react-query to prevent context isolation across chunks
	transpilePackages: [
		"@repo/lib",
		"@repo/ui",
		"@repo/validation",
		"@repo/hooks",
		"@tanstack/react-query",
	],
	turbopack: {}, // Empty config to silence warning
	outputFileTracingRoot: workspaceRoot,
	experimental: {
		viewTransition: true,
		// Optimize preloading to prevent unused resource warnings
		// Note: @tanstack/react-query removed to prevent context isolation issues
		optimizePackageImports: [
			"lucide-react",
			"framer-motion",
		],
	},
	poweredByHeader: false,
	// Image optimization to cache external images (prevents GitHub 429 errors)
	images: {
		remotePatterns: [
			{
				protocol: "https",
				hostname: "opengraph.githubassets.com",
			},
			{
				protocol: "https",
				hostname: "**.githubusercontent.com",
			},
			{
				protocol: "https",
				hostname: "i.ytimg.com",
			},
			{
				protocol: "https",
				hostname: "img.youtube.com",
			},
		],
		// Cache images for 60 days to prevent rate limiting
		minimumCacheTTL: 60 * 60 * 24 * 60,
	},
	async rewrites() {
		// Use internal Railway URL for server-side rewrites, localhost for dev
		const backendUrl = process.env.API_INTERNAL_URL || "http://localhost:4000"
		return [
			{
				source: "/api/:path*",
				destination: `${backendUrl}/api/:path*`,
			},
			{
				source: "/chat/:path*",
				destination: `${backendUrl}/chat/:path*`,
			},
			{
				source: "/socket.io/:path*",
				destination: `${backendUrl}/socket.io/:path*`,
			},
		]
	},
	skipTrailingSlashRedirect: true,
	async headers() {
		return [
			// Prevent caching of HTML pages to ensure fresh builds are served
			{
				source: "/",
				headers: [
					{
						key: "Cache-Control",
						value: "no-store, must-revalidate",
					},
				],
			},
			{
				source: "/:path*",
				headers: [
					{
						key: "X-Content-Type-Options",
						value: "nosniff",
					},
					{
						key: "X-Frame-Options",
						value: "DENY",
					},
					{
						key: "X-XSS-Protection",
						value: "1; mode=block",
					},
					{
						key: "Referrer-Policy",
						value: "strict-origin-when-cross-origin",
					},
					{
						key: "Strict-Transport-Security",
						value: "max-age=31536000; includeSubDomains; preload",
					},
					{
						key: "Content-Security-Policy",
						value: contentSecurityPolicy,
					},
					{
						key: "Permissions-Policy",
						value:
							"camera=(), microphone=(), geolocation=(), interest-cohort=()",
					},
				],
			},
		]
	},
	webpack: (config, { isServer }) => {
		// Suppress redi warning by marking it as external if loaded
		if (!isServer) {
			config.ignoreWarnings = [
				...(config.ignoreWarnings || []),
				{
					module: /node_modules\/@wendellhu\/redi/,
				},
			]
		}
		return config
	},
}

// Sentry has been disabled - using plain Next.js config with next-intl
export default withNextIntl(nextConfig)
