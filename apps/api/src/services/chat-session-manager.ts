type ActiveChatSessionStatus = "active" | "completed" | "failed" | "aborted"

type ActiveChatSession = {
	sessionId: string
	sessionKey: string
	orgId: string
	userId?: string
	conversationId?: string
	requestedSdkSessionId?: string
	resolvedSdkSessionId?: string | null
	abortController: AbortController
	startedAt: number
	lastEventAt: number
	status: ActiveChatSessionStatus
}

type StartSessionInput = {
	sessionKey: string
	orgId: string
	userId?: string
	conversationId?: string
	requestedSdkSessionId?: string
}

type FinishSessionInput = {
	status: Exclude<ActiveChatSessionStatus, "active">
	resolvedSdkSessionId?: string | null
}

export function buildChatSessionKey(input: {
	orgId: string
	userId?: string
	conversationId?: string
}): string {
	if (input.conversationId) {
		return `conversation:${input.conversationId}`
	}
	return `org:${input.orgId}:user:${input.userId ?? "anonymous"}`
}

export class ChatSessionManager {
	private readonly sessionsById = new Map<string, ActiveChatSession>()
	private readonly activeSessionIdByKey = new Map<string, string>()

	start(input: StartSessionInput): {
		sessionId: string
		abortController: AbortController
		replacedSessionId: string | null
	} {
		const existingSessionId = this.activeSessionIdByKey.get(input.sessionKey)
		if (existingSessionId) {
			const existingSession = this.sessionsById.get(existingSessionId)
			if (existingSession) {
				existingSession.status = "aborted"
				existingSession.lastEventAt = Date.now()
				existingSession.abortController.abort("Replaced by a newer session")
			}
			this.sessionsById.delete(existingSessionId)
			this.activeSessionIdByKey.delete(input.sessionKey)
		}

		const sessionId = crypto.randomUUID()
		const now = Date.now()
		const session: ActiveChatSession = {
			sessionId,
			sessionKey: input.sessionKey,
			orgId: input.orgId,
			userId: input.userId,
			conversationId: input.conversationId,
			requestedSdkSessionId: input.requestedSdkSessionId,
			resolvedSdkSessionId: input.requestedSdkSessionId ?? null,
			abortController: new AbortController(),
			startedAt: now,
			lastEventAt: now,
			status: "active",
		}

		this.sessionsById.set(sessionId, session)
		this.activeSessionIdByKey.set(input.sessionKey, sessionId)

		return {
			sessionId,
			abortController: session.abortController,
			replacedSessionId: existingSessionId ?? null,
		}
	}

	touch(sessionId: string): void {
		const session = this.sessionsById.get(sessionId)
		if (!session) return
		session.lastEventAt = Date.now()
	}

	setSdkSessionId(sessionId: string, sdkSessionId: string | null): void {
		const session = this.sessionsById.get(sessionId)
		if (!session) return
		session.resolvedSdkSessionId = sdkSessionId
		session.lastEventAt = Date.now()
	}

	finish(sessionId: string, input: FinishSessionInput): void {
		const session = this.sessionsById.get(sessionId)
		if (!session) return
		session.status = input.status
		session.lastEventAt = Date.now()
		if (input.resolvedSdkSessionId !== undefined) {
			session.resolvedSdkSessionId = input.resolvedSdkSessionId
		}
		this.sessionsById.delete(sessionId)
		const activeId = this.activeSessionIdByKey.get(session.sessionKey)
		if (activeId === sessionId) {
			this.activeSessionIdByKey.delete(session.sessionKey)
		}
	}

	abort(sessionId: string, reason?: string): void {
		const session = this.sessionsById.get(sessionId)
		if (!session) return
		if (!session.abortController.signal.aborted) {
			session.abortController.abort(reason ?? "Cancelled")
		}
		this.finish(sessionId, { status: "aborted" })
	}

	abortBySessionKey(sessionKey: string, reason?: string): string | null {
		const sessionId = this.activeSessionIdByKey.get(sessionKey)
		if (!sessionId) return null
		this.abort(sessionId, reason)
		return sessionId
	}

	abortForUser(input: {
		orgId: string
		userId?: string
		conversationId?: string
		sdkSessionId?: string
		reason?: string
	}): string | null {
		if (input.conversationId) {
			const byConversation = this.abortBySessionKey(
				buildChatSessionKey({
					orgId: input.orgId,
					userId: input.userId,
					conversationId: input.conversationId,
				}),
				input.reason,
			)
			if (byConversation) return byConversation
		}

		if (input.sdkSessionId) {
			for (const [sessionId, session] of this.sessionsById.entries()) {
				if (session.orgId !== input.orgId) continue
				if (session.userId !== input.userId) continue
				if (
					session.requestedSdkSessionId === input.sdkSessionId ||
					session.resolvedSdkSessionId === input.sdkSessionId
				) {
					this.abort(sessionId, input.reason)
					return sessionId
				}
			}
		}

		const fallbackSessionKey = buildChatSessionKey({
			orgId: input.orgId,
			userId: input.userId,
		})
		return this.abortBySessionKey(fallbackSessionKey, input.reason)
	}

	isActiveForUser(input: {
		orgId: string
		userId?: string
		conversationId?: string
		sdkSessionId?: string
	}): boolean {
		if (input.conversationId) {
			const key = buildChatSessionKey({
				orgId: input.orgId,
				userId: input.userId,
				conversationId: input.conversationId,
			})
			if (this.activeSessionIdByKey.has(key)) return true
		}

		if (input.sdkSessionId) {
			for (const session of this.sessionsById.values()) {
				if (session.orgId !== input.orgId) continue
				if (session.userId !== input.userId) continue
				if (
					session.requestedSdkSessionId === input.sdkSessionId ||
					session.resolvedSdkSessionId === input.sdkSessionId
				) {
					return true
				}
			}
		}

		const fallbackKey = buildChatSessionKey({
			orgId: input.orgId,
			userId: input.userId,
		})
		return this.activeSessionIdByKey.has(fallbackKey)
	}
}

export const chatSessionManager = new ChatSessionManager()
