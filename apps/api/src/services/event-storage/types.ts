import type { SupabaseClient } from "@supabase/supabase-js"

export type ConversationEvent = {
  id: string
  conversation_id: string
  type: "user" | "assistant" | "tool_use" | "tool_result" | "error"
  role?: "user" | "assistant"
  content: unknown
  metadata?: Record<string, unknown>
  created_at: string
}

export type ToolResult = {
  id: string
  event_id: string
  tool_name: string
  tool_use_id?: string
  input: unknown
  output?: unknown
  is_error: boolean
  error_message?: string
  executed_at: string
  duration_ms?: number
}

export type Conversation = {
  id: string
  org_id: string
  user_id?: string
  title?: string
  sdk_session_id?: string
  metadata?: Record<string, unknown>
  created_at: string
  updated_at: string
}

export type ClaudeMessage = {
  role: "user" | "assistant"
  content: Array<
    | { type: "text"; text: string }
    | { type: "tool_use"; id: string; name: string; input: unknown }
    | { type: "tool_result"; tool_use_id: string; content: unknown; is_error?: boolean }
  >
}

export type StoreEventInput = {
  conversationId: string
  type: ConversationEvent["type"]
  role?: ConversationEvent["role"]
  content: unknown
  metadata?: Record<string, unknown>
}

export type StoreToolResultInput = {
  eventId: string
  toolName: string
  toolUseId?: string
  input: unknown
  output?: unknown
  isError?: boolean
  errorMessage?: string
  durationMs?: number
}

export type Supabase = SupabaseClient

