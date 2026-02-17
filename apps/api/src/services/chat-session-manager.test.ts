import { describe, expect, it } from "bun:test"
import {
	buildChatSessionKey,
	ChatSessionManager,
} from "./chat-session-manager"

describe("chat-session-manager", () => {
	it("builds deterministic keys", () => {
		const keyWithConversation = buildChatSessionKey({
			orgId: "org-1",
			userId: "user-1",
			conversationId: "conv-1",
		})
		const keyWithoutConversation = buildChatSessionKey({
			orgId: "org-1",
			userId: "user-1",
		})

		expect(keyWithConversation).toBe("conversation:conv-1")
		expect(keyWithoutConversation).toBe("org:org-1:user:user-1")
	})

	it("replaces active session for same session key", () => {
		const manager = new ChatSessionManager()
		const key = buildChatSessionKey({
			orgId: "org-1",
			userId: "user-1",
			conversationId: "conv-1",
		})

		const first = manager.start({
			sessionKey: key,
			orgId: "org-1",
			userId: "user-1",
			conversationId: "conv-1",
			requestedSdkSessionId: "sdk-1",
		})
		const second = manager.start({
			sessionKey: key,
			orgId: "org-1",
			userId: "user-1",
			conversationId: "conv-1",
			requestedSdkSessionId: "sdk-2",
		})

		expect(second.replacedSessionId).toBe(first.sessionId)
		expect(first.abortController.signal.aborted).toBe(true)
		expect(
			manager.isActiveForUser({
				orgId: "org-1",
				userId: "user-1",
				conversationId: "conv-1",
			}),
		).toBe(true)
	})

	it("aborts active session by conversation id", () => {
		const manager = new ChatSessionManager()
		const key = buildChatSessionKey({
			orgId: "org-1",
			userId: "user-1",
			conversationId: "conv-1",
		})

		const started = manager.start({
			sessionKey: key,
			orgId: "org-1",
			userId: "user-1",
			conversationId: "conv-1",
		})
		const aborted = manager.abortForUser({
			orgId: "org-1",
			userId: "user-1",
			conversationId: "conv-1",
			reason: "test-cancel",
		})

		expect(aborted).toBe(started.sessionId)
		expect(started.abortController.signal.aborted).toBe(true)
		expect(
			manager.isActiveForUser({
				orgId: "org-1",
				userId: "user-1",
				conversationId: "conv-1",
			}),
		).toBe(false)
	})

	it("aborts by sdk session id when conversation id is absent", () => {
		const manager = new ChatSessionManager()
		const key = buildChatSessionKey({
			orgId: "org-1",
			userId: "user-1",
		})
		const started = manager.start({
			sessionKey: key,
			orgId: "org-1",
			userId: "user-1",
			requestedSdkSessionId: "sdk-abc",
		})

		manager.setSdkSessionId(started.sessionId, "sdk-abc")

		const aborted = manager.abortForUser({
			orgId: "org-1",
			userId: "user-1",
			sdkSessionId: "sdk-abc",
		})

		expect(aborted).toBe(started.sessionId)
		expect(
			manager.isActiveForUser({
				orgId: "org-1",
				userId: "user-1",
				sdkSessionId: "sdk-abc",
			}),
		).toBe(false)
	})

	it("marks finished session as inactive", () => {
		const manager = new ChatSessionManager()
		const key = buildChatSessionKey({
			orgId: "org-1",
			userId: "user-1",
			conversationId: "conv-2",
		})
		const started = manager.start({
			sessionKey: key,
			orgId: "org-1",
			userId: "user-1",
			conversationId: "conv-2",
		})

		manager.finish(started.sessionId, {
			status: "completed",
			resolvedSdkSessionId: "sdk-done",
		})

		expect(
			manager.isActiveForUser({
				orgId: "org-1",
				userId: "user-1",
				conversationId: "conv-2",
			}),
		).toBe(false)
	})
})
