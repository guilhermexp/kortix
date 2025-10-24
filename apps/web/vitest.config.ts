import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
	test: {
		environment: "jsdom",
		globals: true,
		setupFiles: ["./vitest.setup.ts"],
		coverage: {
			provider: "v8",
			reporter: ["text", "json", "html"],
			exclude: [
				"node_modules/",
				"vitest.setup.ts",
				"**/*.config.ts",
				"**/*.d.ts",
				"**/types/**",
				"**/*.test.{ts,tsx}",
			],
		},
		css: false,
	},
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "./"),
			"@/components": path.resolve(__dirname, "./components"),
			"@/lib": path.resolve(__dirname, "./lib"),
			"@/hooks": path.resolve(__dirname, "./hooks"),
			"@/stores": path.resolve(__dirname, "./stores"),
		},
	},
});
