import type { SupabaseClient } from "@supabase/supabase-js";

export type ConversationEvent = {
  id: string;
  conversation_id: string;
  type: "user" | "assistant" | "tool_use" | "tool_result" | "error";
  role?: "user" | "assistant";
  content: unknown;
  metadata?: Record<string, unknown>;
  created_at: string;
};

export type ToolResult = {
  id: string;
  event_id: string;
  tool_name: string;
  tool_use_id?: string;
  input: unknown;
  output?: unknown;
  is_error: boolean;
  error_message?: string;
  executed_at: string;
  duration_ms?: number;
};

export type Conversation = {
  id: string;
  org_id: string;
  user_id?: string;
  title?: string;
  sdk_session_id?: string; // Claude Agent SDK session ID
  metadata?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type ClaudeMessage = {
  role: "user" | "assistant";
  content: Array<
    | { type: "text"; text: string }
    | { type: "tool_use"; id: string; name: string; input: unknown }
    | {
        type: "tool_result";
        tool_use_id: string;
        content: unknown;
        is_error?: boolean;
      }
  >;
};

export type StoreEventInput = {
  conversationId: string;
  type: ConversationEvent["type"];
  role?: ConversationEvent["role"];
  content: unknown;
  metadata?: Record<string, unknown>;
};

export type StoreToolResultInput = {
  eventId: string;
  toolName: string;
  toolUseId?: string;
  input: unknown;
  output?: unknown;
  isError?: boolean;
  errorMessage?: string;
  durationMs?: number;
};

export class ConversationStorageUnavailableError extends Error {
  constructor(message = "Conversation storage tables are not available") {
    super(message);
    this.name = "ConversationStorageUnavailableError";
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isTableMissingError(error: unknown, table: string): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const code = (error as { code?: string }).code;
  if (code === "42P01") {
    return true;
  }

  const message = String((error as { message?: string }).message ?? "");
  if (!message) return false;
  const normalizedTable = table.startsWith("public.")
    ? table
    : `public.${table}`;
  return (
    message.includes("does not exist") ||
    message.includes(`Could not find the table '${normalizedTable}'`) ||
    message.includes(`Could not find the table '${table}'`)
  );
}

function handleTableMissing(error: unknown, table: string): never {
  if (isTableMissingError(error, table)) {
    throw new ConversationStorageUnavailableError(
      `Supabase table ${table} não existe. Execute a migration das conversas antes de habilitar o histórico.`,
    );
  }
  throw error;
}

function parseToolUseContent(value: unknown): {
  id?: string;
  name?: string;
  input?: unknown;
} | null {
  if (!isPlainObject(value)) {
    return null;
  }
  const type = value.type;
  if (type && type !== "tool_use") {
    return null;
  }

  return {
    id: typeof value.id === "string" ? value.id : undefined,
    name: typeof value.name === "string" ? value.name : undefined,
    input: "input" in value ? (value as { input: unknown }).input : undefined,
  };
}

function parseToolResultContent(value: unknown): {
  tool_use_id?: string;
  content?: unknown;
  is_error?: boolean;
} | null {
  if (!isPlainObject(value)) {
    return null;
  }
  const type = value.type;
  if (type && type !== "tool_result") {
    return null;
  }

  return {
    tool_use_id:
      typeof value.tool_use_id === "string" ? value.tool_use_id : undefined,
    content:
      "content" in value ? (value as { content: unknown }).content : undefined,
    is_error: typeof value.is_error === "boolean" ? value.is_error : undefined,
  };
}

export class EventStorageService {
  constructor(private readonly client: SupabaseClient) {}

  /**
   * Create a new conversation
   */
  async createConversation(
    orgId: string,
    userId?: string,
    title?: string,
    metadata?: Record<string, unknown>,
    sdkSessionId?: string,
  ): Promise<Conversation> {
    const { data, error } = await this.client
      .from("conversations")
      .insert({
        org_id: orgId,
        user_id: userId,
        title,
        sdk_session_id: sdkSessionId,
        metadata: metadata ?? {},
      })
      .select()
      .single();

    if (error) {
      handleTableMissing(error, "conversations");
    }

    if (!data) {
      throw new Error("No conversation data returned after creation");
    }

    return data as Conversation;
  }

  /**
   * Get a conversation by ID
   */
  async getConversation(conversationId: string): Promise<Conversation | null> {
    const { data, error } = await this.client
      .from("conversations")
      .select()
      .eq("id", conversationId)
      .maybeSingle();

    if (error) {
      handleTableMissing(error, "conversations");
    }

    return data as Conversation | null;
  }

  /**
   * Update the SDK session ID for a conversation
   */
  async updateSdkSessionId(
    conversationId: string,
    sdkSessionId: string,
  ): Promise<void> {
    const { error } = await this.client
      .from("conversations")
      .update({ sdk_session_id: sdkSessionId })
      .eq("id", conversationId);

    if (error) {
      handleTableMissing(error, "conversations");
      console.error("[EventStorage] Failed to update SDK session ID:", error);
    }
  }

  /**
   * Store a conversation event
   */
  async storeEvent(input: StoreEventInput): Promise<ConversationEvent> {
    const { conversationId, type, role, content, metadata } = input;

    // Validate input
    if (!conversationId || typeof conversationId !== "string") {
      throw new Error("Invalid conversation ID");
    }

    if (
      !type ||
      !["user", "assistant", "tool_use", "tool_result", "error"].includes(type)
    ) {
      throw new Error(`Invalid event type: ${type}`);
    }

    if (content === undefined || content === null) {
      throw new Error("Event content is required");
    }

    const { data, error } = await this.client
      .from("conversation_events")
      .insert({
        conversation_id: conversationId,
        type,
        role,
        content,
        metadata: metadata ?? {},
      })
      .select()
      .single();

    if (error) {
      handleTableMissing(error, "conversation_events");
    }

    if (!data) {
      throw new Error("No event data returned after storage");
    }

    return data as ConversationEvent;
  }

  /**
   * Store a tool result
   */
  async storeToolResult(input: StoreToolResultInput): Promise<ToolResult> {
    const {
      eventId,
      toolName,
      toolUseId,
      input: toolInput,
      output,
      isError,
      errorMessage,
      durationMs,
    } = input;

    // Validate input
    if (!eventId || typeof eventId !== "string") {
      throw new Error("Invalid event ID");
    }

    if (!toolName || typeof toolName !== "string") {
      throw new Error("Invalid tool name");
    }

    const { data, error } = await this.client
      .from("tool_results")
      .insert({
        event_id: eventId,
        tool_name: toolName,
        tool_use_id: toolUseId,
        input: toolInput,
        output,
        is_error: isError ?? false,
        error_message: errorMessage,
        duration_ms: durationMs,
      })
      .select()
      .single();

    if (error) {
      handleTableMissing(error, "tool_results");
    }

    if (!data) {
      throw new Error("No tool result data returned after storage");
    }

    return data as ToolResult;
  }

  /**
   * Retrieve all events for a conversation in chronological order
   */
  async getConversationEvents(
    conversationId: string,
  ): Promise<ConversationEvent[]> {
    const { data, error } = await this.client
      .from("conversation_events")
      .select()
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });

    if (error) {
      handleTableMissing(error, "conversation_events");
    }

    return (data ?? []) as ConversationEvent[];
  }

  /**
   * Retrieve tool results for specific events
   */
  async getToolResults(eventIds: string[]): Promise<ToolResult[]> {
    if (!eventIds || eventIds.length === 0) {
      return [];
    }

    const { data, error } = await this.client
      .from("tool_results")
      .select()
      .in("event_id", eventIds);

    if (error) {
      handleTableMissing(error, "tool_results");
    }

    return (data ?? []) as ToolResult[];
  }

  /**
   * Build Claude messages with tool_use blocks from stored conversation events
   * This reconstructs the complete conversation history including tool interactions
   */
  async buildClaudeMessages(conversationId: string): Promise<ClaudeMessage[]> {
    const events = await this.getConversationEvents(conversationId);

    if (events.length === 0) {
      return [];
    }

    // Get all tool_use and tool_result event IDs to fetch tool results
    const toolEventIds = events
      .filter((e) => e.type === "tool_use" || e.type === "tool_result")
      .map((e) => e.id);

    const toolResults = await this.getToolResults(toolEventIds);
    const toolResultsByEventId = new Map(
      toolResults.map((tr) => [tr.event_id, tr]),
    );
    const toolResultsByToolUseId = new Map<string, ToolResult>();
    for (const result of toolResults) {
      if (result.tool_use_id) {
        toolResultsByToolUseId.set(result.tool_use_id, result);
      }
    }

    const messages: ClaudeMessage[] = [];
    let currentMessage: ClaudeMessage | null = null;

    for (const event of events) {
      // Start a new message when role changes or on first event
      if (
        !currentMessage ||
        (event.role && event.role !== currentMessage.role)
      ) {
        if (currentMessage) {
          messages.push(currentMessage);
        }
        currentMessage = {
          role: event.role ?? "user",
          content: [],
        };
      }

      // Process event based on type
      switch (event.type) {
        case "user":
        case "assistant": {
          const text = this.extractTextFromContent(event.content);
          if (text) {
            currentMessage.content.push({ type: "text", text });
          }
          break;
        }

        case "tool_use": {
          const parsed = parseToolUseContent(event.content);
          const fallback =
            (parsed?.id && toolResultsByToolUseId.get(parsed.id)) ??
            toolResultsByToolUseId.get(event.id);
          const block = this.buildToolUseBlock(event, parsed, fallback);
          if (block) {
            currentMessage.content.push(block);
          }
          break;
        }

        case "tool_result": {
          const toolResult = toolResultsByEventId.get(event.id);
          const parsed = parseToolResultContent(event.content);
          const block = this.buildToolResultBlock(event, parsed, toolResult);
          if (block) {
            currentMessage.content.push(block);
          }
          break;
        }

        case "error": {
          const errorText = this.extractTextFromContent(event.content);
          if (errorText) {
            currentMessage.content.push({
              type: "text",
              text: `Error: ${errorText}`,
            });
          }
          break;
        }
      }
    }

    // Push the last message
    if (currentMessage && currentMessage.content.length > 0) {
      messages.push(currentMessage);
    }

    return messages;
  }

  private buildToolUseBlock(
    event: ConversationEvent,
    parsed: ReturnType<typeof parseToolUseContent>,
    fallback?: ToolResult,
  ): ClaudeMessage["content"][number] | null {
    if (!parsed && !fallback) {
      return null;
    }

    const id = parsed?.id ?? fallback?.tool_use_id ?? event.id;
    const name = parsed?.name ?? fallback?.tool_name ?? "tool";
    const input =
      parsed && Object.prototype.hasOwnProperty.call(parsed, "input")
        ? parsed.input
        : (fallback?.input ?? null);

    return {
      type: "tool_use",
      id,
      name,
      input,
    };
  }

  private buildToolResultBlock(
    event: ConversationEvent,
    parsed: ReturnType<typeof parseToolResultContent>,
    fallback?: ToolResult,
  ): ClaudeMessage["content"][number] | null {
    if (!parsed && !fallback) {
      return null;
    }

    const toolUseId = parsed?.tool_use_id ?? fallback?.tool_use_id ?? event.id;
    const content =
      parsed && Object.prototype.hasOwnProperty.call(parsed, "content")
        ? parsed.content
        : (fallback?.output ?? null);
    const isError =
      parsed && Object.prototype.hasOwnProperty.call(parsed, "is_error")
        ? Boolean(parsed.is_error)
        : (fallback?.is_error ?? false);

    return {
      type: "tool_result",
      tool_use_id: toolUseId,
      content,
      is_error: isError ? true : undefined,
    };
  }

  /**
   * Extract text content from various content formats
   */
  private extractTextFromContent(content: unknown): string {
    if (typeof content === "string") {
      return content;
    }

    if (typeof content === "object" && content !== null) {
      // Handle { text: string } format
      if (
        "text" in content &&
        typeof (content as { text: unknown }).text === "string"
      ) {
        return (content as { text: string }).text;
      }

      // Handle array of content blocks
      if (Array.isArray(content)) {
        const textParts: string[] = [];
        for (const item of content) {
          if (typeof item === "string") {
            textParts.push(item);
          } else if (
            typeof item === "object" &&
            item !== null &&
            "text" in item
          ) {
            const text = (item as { text: unknown }).text;
            if (typeof text === "string") {
              textParts.push(text);
            }
          }
        }
        return textParts.join(" ");
      }
    }

    return "";
  }

  /**
   * Delete a conversation and all its events
   */
  async deleteConversation(conversationId: string): Promise<void> {
    const { error } = await this.client
      .from("conversations")
      .delete()
      .eq("id", conversationId);

    if (error) {
      handleTableMissing(error, "conversations");
    }
  }

  /**
   * Update conversation metadata
   */
  async updateConversation(
    conversationId: string,
    updates: {
      title?: string;
      metadata?: Record<string, unknown>;
    },
  ): Promise<Conversation> {
    const { data, error } = await this.client
      .from("conversations")
      .update(updates)
      .eq("id", conversationId)
      .select()
      .single();

    if (error) {
      handleTableMissing(error, "conversations");
    }

    if (!data) {
      throw new Error("No conversation data returned after update");
    }

    return data as Conversation;
  }

  /**
   * List conversations for an organization
   */
  async listConversations(
    orgId: string,
    options?: {
      userId?: string;
      limit?: number;
      offset?: number;
    },
  ): Promise<Conversation[]> {
    let query = this.client
      .from("conversations")
      .select()
      .eq("org_id", orgId)
      .order("updated_at", { ascending: false });

    if (options?.userId) {
      query = query.eq("user_id", options.userId);
    }

    if (options?.limit) {
      query = query.limit(options.limit);
    }

    if (options?.offset) {
      query = query.range(
        options.offset,
        options.offset + (options.limit ?? 50) - 1,
      );
    }

    const { data, error } = await query;

    if (error) {
      handleTableMissing(error, "conversations");
    }

    return (data ?? []) as Conversation[];
  }
}
