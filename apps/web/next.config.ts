import type { NextConfig } from "next";

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
    const backendUrl = process.env.API_INTERNAL_URL || "http://localhost:4000";
    return [
      {
        source: "/api/:path*",
        destination: `${backendUrl}/api/:path*`,
      },
      {
        source: "/chat/:path*",
        destination: `${backendUrl}/chat/:path*`,
      },
    ];
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
    ];
  },
  webpack: (config, { isServer }) => {
    // Suppress redi warning by marking it as external if loaded
    if (!isServer) {
      config.resolve.alias = {
        ...config.resolve.alias,
        // Suppress console warnings from redi library
      };
      config.ignoreWarnings = [
        ...(config.ignoreWarnings || []),
        {
          module: /node_modules\/@wendellhu\/redi/,
        },
      ];
    }
    return config;
  },
};

// Sentry has been disabled - using plain Next.js config
export default nextConfig;
