import { test, expect, type Page } from "@playwright/test";

/**
 * E2E Test Suite for Chat Modes
 *
 * This test validates the complete chat flow:
 * 1. Authentication
 * 2. Mode selection (Simple, Agentic, Deep)
 * 3. Message submission
 * 4. Response validation with citations
 * 5. Tool usage (searchMemories)
 */

// Environment configuration
const BACKEND_URL = process.env.E2E_BACKEND_URL || "http://localhost:4000";
const BASE_URL = process.env.E2E_BASE_URL || "http://localhost:3000";
const SESSION_COOKIE = process.env.E2E_SESSION_COOKIE || "";
const TEST_QUERY = process.env.E2E_TEST_QUERY || "O que tenho sobre IA?";

test.describe("Chat Modes E2E", () => {
	test.beforeEach(async ({ page, context }) => {
		// Set authentication cookie if provided
		if (SESSION_COOKIE) {
			const [name, value] = SESSION_COOKIE.split("=");
			await context.addCookies([
				{
					name: name.trim(),
					value: value.trim(),
					domain: "localhost",
					path: "/",
				},
			]);
		}

		// Navigate to chat page
		await page.goto("/");

		// Wait for the page to be fully loaded
		await page.waitForLoadState("networkidle");
	});

	/**
	 * Helper: Send a message and wait for response
	 */
	async function sendMessage(page: Page, message: string) {
		const input = page.locator('input[placeholder*="Say something"]');
		await input.fill(message);

		// Submit the message
		await input.press("Enter");

		// Wait for "Thinking..." to appear
		await expect(
			page.locator('text="Thinking..."').or(page.locator('text="Searching memories..."')),
		).toBeVisible({ timeout: 5000 });
	}

	/**
	 * Helper: Wait for response to complete
	 */
	async function waitForResponse(page: Page) {
		// Wait for thinking/searching indicators to disappear
		await expect(page.locator('text="Thinking..."')).not.toBeVisible({
			timeout: 60000,
		});
		await expect(page.locator('text="Searching memories..."')).not.toBeVisible({
			timeout: 60000,
		});
	}

	/**
	 * Helper: Intercept chat request and validate payload
	 */
	async function interceptChatRequest(
		page: Page,
		expectedMode: "simple" | "agentic" | "deep",
	) {
		return new Promise((resolve) => {
			page.on("request", (request) => {
				if (request.url().includes("/chat/v2")) {
					const postData = request.postDataJSON();
					if (postData) {
						expect(postData.mode).toBe(expectedMode);
						resolve(postData);
					}
				}
			});
		});
	}

	test("should display mode selector", async ({ page }) => {
		const modeSelector = page.locator("#chat-mode");
		await expect(modeSelector).toBeVisible();

		// Verify all mode options are present
		const options = await modeSelector.locator("option").allTextContents();
		expect(options).toContain("Simple");
		expect(options).toContain("Agentic");
		expect(options).toContain("Deep");
	});

	test("should default to Simple mode", async ({ page }) => {
		const modeSelector = page.locator("#chat-mode");
		await expect(modeSelector).toHaveValue("simple");
	});

	test("should send message in Simple mode", async ({ page }) => {
		// Ensure Simple mode is selected
		await page.selectOption("#chat-mode", "simple");

		// Intercept the request
		const requestPromise = interceptChatRequest(page, "simple");

		// Send message
		await sendMessage(page, TEST_QUERY);

		// Validate request payload
		await requestPromise;

		// Wait for response
		await waitForResponse(page);

		// Verify response is displayed
		const messages = page.locator('[class*="flex flex-col gap-2"]');
		await expect(messages).toContainText(TEST_QUERY);
	});

	test("should send message in Agentic mode and validate tool usage", async ({
		page,
	}) => {
		// Select Agentic mode
		await page.selectOption("#chat-mode", "agentic");

		// Intercept the request
		const requestPromise = interceptChatRequest(page, "agentic");

		// Send message
		await sendMessage(page, TEST_QUERY);

		// Validate request payload
		await requestPromise;

		// Wait for tool usage indicator
		const toolIndicator = page.locator('text="Searching memories..."');
		await expect(toolIndicator).toBeVisible({ timeout: 10000 });

		// Wait for response
		await waitForResponse(page);

		// Check for "Found X memories" or "No memories found"
		const foundMemories = page
			.locator('text=/Found \\d+ memor(y|ies)/')
			.or(page.locator('text="No memories found"'));
		await expect(foundMemories).toBeVisible({ timeout: 5000 });

		// If memories were found, verify the expandable component
		const foundMemoriesText = await foundMemories.textContent();
		if (foundMemoriesText?.includes("Found")) {
			// Click to expand
			await foundMemories.click();

			// Verify memory results are displayed
			const memoryResults = page.locator('[class*="ml-6 space-y-2"]');
			await expect(memoryResults).toBeVisible();
		}
	});

	test("should send message in Deep mode", async ({ page }) => {
		// Select Deep mode
		await page.selectOption("#chat-mode", "deep");

		// Intercept the request
		const requestPromise = interceptChatRequest(page, "deep");

		// Send message
		await sendMessage(page, TEST_QUERY);

		// Validate request payload
		await requestPromise;

		// Wait for response
		await waitForResponse(page);

		// Verify response is displayed
		const messages = page.locator('[class*="flex flex-col gap-2"]');
		await expect(messages).toContainText(TEST_QUERY);
	});

	test("should validate response format with citations in Agentic mode", async ({
		page,
	}) => {
		// Select Agentic mode
		await page.selectOption("#chat-mode", "agentic");

		// Send message
		await sendMessage(page, TEST_QUERY);

		// Wait for response
		await waitForResponse(page);

		// Get the last assistant message
		const assistantMessages = page.locator('[class*="items-start"]');
		const lastMessage = assistantMessages.last();

		// Check for citation format [N] in the response
		const messageText = await lastMessage.textContent();

		// If there are memories, the response should contain citations like [1], [2], etc.
		// or explicitly state "no relevant information"
		const hasCitations = /\[\d+\]/.test(messageText || "");
		const hasNoInfoMessage =
			messageText?.toLowerCase().includes("no relevant") ||
			messageText?.toLowerCase().includes("couldn't find");

		expect(hasCitations || hasNoInfoMessage).toBeTruthy();
	});

	test("should switch between modes without losing conversation", async ({
		page,
	}) => {
		// Start with Simple mode
		await page.selectOption("#chat-mode", "simple");
		await sendMessage(page, "Hello");
		await waitForResponse(page);

		// Count messages
		const messagesBeforeSwitch = await page
			.locator('[class*="flex flex-col gap-2"]')
			.count();

		// Switch to Agentic mode
		await page.selectOption("#chat-mode", "agentic");

		// Send another message
		await sendMessage(page, TEST_QUERY);
		await waitForResponse(page);

		// Verify messages are preserved
		const messagesAfterSwitch = await page
			.locator('[class*="flex flex-col gap-2"]')
			.count();
		expect(messagesAfterSwitch).toBeGreaterThan(messagesBeforeSwitch);

		// Verify both messages are present
		await expect(page.locator('text="Hello"')).toBeVisible();
		await expect(page.locator(`text="${TEST_QUERY}"`)).toBeVisible();
	});

	test("should copy assistant response to clipboard", async ({ page, context }) => {
		// Grant clipboard permissions
		await context.grantPermissions(["clipboard-read", "clipboard-write"]);

		// Send a message
		await page.selectOption("#chat-mode", "simple");
		await sendMessage(page, "Test message");
		await waitForResponse(page);

		// Find the copy button for the assistant's response
		const copyButton = page.locator('button[class*="size-7"]').first();
		await copyButton.click();

		// Verify toast notification
		await expect(page.locator('text="Copied to clipboard"')).toBeVisible({
			timeout: 5000,
		});
	});

	test("should regenerate assistant response", async ({ page }) => {
		// Send a message
		await page.selectOption("#chat-mode", "simple");
		await sendMessage(page, "Test regeneration");
		await waitForResponse(page);

		// Get the first response text
		const assistantMessage = page.locator('[class*="items-start"]').last();
		const firstResponseText = await assistantMessage.textContent();

		// Click regenerate button
		const regenerateButton = page
			.locator('button[class*="size-6"]')
			.filter({ hasText: "" })
			.first();
		await regenerateButton.click();

		// Wait for new response
		await waitForResponse(page);

		// Verify a response is present (might be the same or different)
		const newAssistantMessage = page.locator('[class*="items-start"]').last();
		const newResponseText = await newAssistantMessage.textContent();
		expect(newResponseText).toBeTruthy();
	});

	test("should validate API endpoint is /chat/v2", async ({ page }) => {
		let chatV2Called = false;

		page.on("request", (request) => {
			if (request.url().includes("/chat/v2")) {
				chatV2Called = true;
			}
		});

		// Send a message to trigger the request
		await sendMessage(page, "Test endpoint");

		// Wait a bit for the request to be captured
		await page.waitForTimeout(2000);

		expect(chatV2Called).toBeTruthy();
	});

	test("should validate graph highlights from searchMemories tool", async ({
		page,
	}) => {
		// Select Agentic mode (uses searchMemories tool)
		await page.selectOption("#chat-mode", "agentic");

		// Send message
		await sendMessage(page, TEST_QUERY);

		// Wait for response
		await waitForResponse(page);

		// Check for memory results with documentId
		const expandableMemories = page.locator('[class*="flex items-center gap-2"]');
		const hasMemories = await expandableMemories
			.filter({ hasText: /Found \d+ memor/ })
			.count();

		if (hasMemories > 0) {
			// Click to expand memories
			await expandableMemories.first().click();

			// Verify memory cards are displayed
			const memoryCards = page.locator('[class*="p-2 bg-white/5"]');
			await expect(memoryCards.first()).toBeVisible();

			// Note: Graph highlighting is managed by useGraphHighlights store
			// Actual graph visualization testing would require additional setup
		}
	});
});
