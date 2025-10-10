import { withSentryConfig } from "@sentry/nextjs"
import type { NextConfig } from "next"

const nextConfig: NextConfig = {
	experimental: {
		viewTransition: true,
	},
	eslint: {
		ignoreDuringBuilds: true,
	},
	poweredByHeader: false,
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

export default withSentryConfig(nextConfig, {
	// For all available options, see:
	// https://www.npmjs.com/package/@sentry/webpack-plugin#options

	org: "supermemory",

	project: "consumer-app",

	// Only print logs for uploading source maps in CI
	silent: !process.env.CI,

	// For all available options, see:
	// https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

	// Upload a larger set of source maps for prettier stack traces (increases build time)
	widenClientFileUpload: true,

	// Automatically tree-shake Sentry logger statements to reduce bundle size
	disableLogger: true,

	// Enables automatic instrumentation of Vercel Cron Monitors. (Does not yet work with App Router route handlers.)
	// See the following for more information:
	// https://docs.sentry.io/product/crons/
	// https://vercel.com/docs/cron-jobs
	automaticVercelMonitors: true,
})
