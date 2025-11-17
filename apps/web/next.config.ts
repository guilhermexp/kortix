import path from "node:path"
import type { NextConfig } from "next"

const workspaceRoot = path.resolve(__dirname, "..", "..")

const nextConfig: NextConfig = {
	// Temporarily ignore TypeScript errors during build for Railway deployment
	typescript: {
		ignoreBuildErrors: true,
	},
	turbopack: {
		// Explicitly tell Turbopack to treat the monorepo root as the project root.
		// This keeps dependency resolution inside /Public/supermemory even when multiple lockfiles exist above.
		root: workspaceRoot,
	},
	experimental: {
		viewTransition: true,
		// Optimize preloading to prevent unused resource warnings
		optimizePackageImports: ["lucide-react", "framer-motion"],
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
		]
	},
	skipTrailingSlashRedirect: true,
	async headers() {
		return [
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
				],
			},
		]
	},
	webpack: (config, { isServer }) => {
		// Suppress redi warning by marking it as external if loaded
		if (!isServer) {
			config.resolve.alias = {
				...config.resolve.alias,
				// Suppress console warnings from redi library
			}
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

// Sentry has been disabled - using plain Next.js config
export default nextConfig
