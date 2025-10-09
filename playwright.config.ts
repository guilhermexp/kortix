import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright configuration for E2E testing
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
	testDir: "./e2e",
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	workers: process.env.CI ? 1 : undefined,
	reporter: "html",
	use: {
		baseURL: process.env.E2E_BASE_URL || "http://localhost:3000",
		trace: "on-first-retry",
		screenshot: "only-on-failure",
	},

	projects: [
		{
			name: "chromium",
			use: { ...devices["Desktop Chrome"] },
		},
	],

	webServer: [
		{
			command: "bun run --cwd apps/api dev",
			url: "http://localhost:4000/health",
			reuseExistingServer: !process.env.CI,
			timeout: 120000,
		},
		{
			command: "bun run --cwd apps/web dev",
			url: "http://localhost:3000",
			reuseExistingServer: !process.env.CI,
			timeout: 120000,
		},
	],
});
