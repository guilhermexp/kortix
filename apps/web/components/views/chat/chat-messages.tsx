"use client";

import { useChat, useCompletion } from "@ai-sdk/react";
import { BACKEND_URL } from "@lib/env";
import { cn } from "@lib/utils";
import { Button } from "@ui/components/button";
import { Input } from "@ui/components/input";
import {
  InputGroup,
  InputGroupTextarea,
  InputGroupAddon,
  InputGroupButton,
} from "@/components/ui/input-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@ui/components/select";
import { DefaultChatTransport } from "ai";
import {
  ArrowUp,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  RotateCcw,
  X,
  Plus,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Streamdown } from "streamdown";
import { TextShimmer } from "@/components/text-shimmer";
import { DEFAULT_PROJECT_ID } from "@repo/lib/constants";
import { usePersistentChat, useProject } from "@/stores";
import { useGraphHighlights } from "@/stores/highlights";
import { Spinner } from "../../spinner";
import { Info } from "lucide-react";

interface MemoryResult {
  documentId?: string;
  title?: string;
  content?: string;
  url?: string;
  score?: number;
}

interface ExpandableMemoriesProps {
  foundCount: number;
  results: MemoryResult[];
}

type ToolState =
  | "input-available"
  | "input-streaming"
  | "output-available"
  | "output-error";

type TextPart = {
  type: "text";
  text: string;
};

type SearchMemoriesPart =
  | {
      type: "tool-searchMemories";
      state: Exclude<ToolState, "output-available">;
    }
  | {
      type: "tool-searchMemories";
      state: "output-available";
      output: {
        count?: unknown;
        results?: unknown;
      };
    };

type SearchMemoriesOutputPart = Extract<
  SearchMemoriesPart,
  { state: "output-available" }
>;

type AddMemoryPart = {
  type: "tool-addMemory";
  state: ToolState;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isTextPart(part: unknown): part is TextPart {
  return (
    isObject(part) && part.type === "text" && typeof part.text === "string"
  );
}

function isToolState(value: unknown): value is ToolState {
  return (
    typeof value === "string" &&
    [
      "input-available",
      "input-streaming",
      "output-available",
      "output-error",
    ].includes(value)
  );
}

function isSearchMemoriesPart(part: unknown): part is SearchMemoriesPart {
  return (
    isObject(part) &&
    part.type === "tool-searchMemories" &&
    isToolState(part.state)
  );
}

function isSearchMemoriesOutputPart(
  part: unknown,
): part is SearchMemoriesOutputPart {
  return (
    isSearchMemoriesPart(part) &&
    part.state === "output-available" &&
    "output" in part &&
    isObject(part.output ?? null)
  );
}

function isAddMemoryPart(part: unknown): part is AddMemoryPart {
  return (
    isObject(part) && part.type === "tool-addMemory" && isToolState(part.state)
  );
}

function toMemoryResult(value: unknown): MemoryResult | null {
  if (!isObject(value)) return null;
  const { documentId, title, content, url, score } = value;
  const parsedScore =
    typeof score === "number"
      ? score
      : typeof score === "string"
        ? Number.parseFloat(score)
        : undefined;
  return {
    documentId: typeof documentId === "string" ? documentId : undefined,
    title: typeof title === "string" ? title : undefined,
    content: typeof content === "string" ? content : undefined,
    url: typeof url === "string" ? url : undefined,
    score: Number.isFinite(parsedScore) ? parsedScore : undefined,
  };
}

function toMemoryResults(value: unknown): MemoryResult[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => toMemoryResult(item))
    .filter((item): item is MemoryResult => item !== null);
}

function ExpandableMemories({ foundCount, results }: ExpandableMemoriesProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (foundCount === 0) {
    return (
      <div className="text-sm flex items-center gap-2 text-muted-foreground">
        <Check className="size-4" /> No memories found
      </div>
    );
  }

  return (
    <div className="text-sm">
      <button
        className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
        type="button"
      >
        {isExpanded ? (
          <ChevronDown className="size-4" />
        ) : (
          <ChevronRight className="size-4" />
        )}
        <Check className="size-4" />
        Found {foundCount} {foundCount === 1 ? "memory" : "memories"}
      </button>

      {isExpanded && results.length > 0 && (
        <div className="mt-3 ml-6 space-y-2.5 max-h-64 overflow-y-auto pr-2">
          {results.map((result, index) => {
            const isClickable =
              result.url &&
              (result.url.startsWith("http://") ||
                result.url.startsWith("https://"));

            const content = (
              <>
                {result.title && (
                  <div className="font-semibold text-sm mb-1.5 text-foreground">
                    {result.title}
                  </div>
                )}
                {result.content && (
                  <div className="text-xs text-muted-foreground/90 line-clamp-3 leading-relaxed mb-2">
                    {result.content}
                  </div>
                )}
                <div className="flex items-center justify-between gap-2 mt-2 pt-2 border-t border-white/5">
                  {result.url && (
                    <div className="text-xs text-blue-400/80 truncate flex-1">
                      {result.url}
                    </div>
                  )}
                  {result.score && (
                    <div className="text-xs text-muted-foreground/70 font-mono shrink-0">
                      {(result.score * 100).toFixed(0)}%
                    </div>
                  )}
                </div>
              </>
            );

            if (isClickable) {
              return (
                <a
                  className="block p-2 bg-white/5 rounded-md border border-white/10 hover:bg-white/10 hover:border-white/20 transition-colors cursor-pointer"
                  href={result.url}
                  key={result.documentId || index}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  {content}
                </a>
              );
            }

            return (
              <div
                className="p-2 bg-white/5 rounded-md border border-white/10"
                key={result.documentId || index}
              >
                {content}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function useStickyAutoScroll(triggerKeys: ReadonlyArray<unknown>) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [isAutoScroll, setIsAutoScroll] = useState(true);
  const [isFarFromBottom, setIsFarFromBottom] = useState(false);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "auto") => {
    const node = bottomRef.current;
    if (node) node.scrollIntoView({ behavior, block: "end" });
  }, []);

  useEffect(function observeBottomVisibility() {
    const container = scrollContainerRef.current;
    const sentinel = bottomRef.current;
    if (!container || !sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries || entries.length === 0) return;
        const isIntersecting = entries.some((e) => e.isIntersecting);
        setIsAutoScroll(isIntersecting);
      },
      { root: container, rootMargin: "0px 0px 80px 0px", threshold: 0 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  useEffect(
    function observeContentResize() {
      const container = scrollContainerRef.current;
      if (!container) return;
      const resizeObserver = new ResizeObserver(() => {
        if (isAutoScroll) scrollToBottom("auto");
        const distanceFromBottom =
          container.scrollHeight - container.scrollTop - container.clientHeight;
        setIsFarFromBottom(distanceFromBottom > 100);
      });
      resizeObserver.observe(container);
      return () => resizeObserver.disconnect();
    },
    [isAutoScroll, scrollToBottom],
  );

  function enableAutoScroll() {
    setIsAutoScroll(true);
  }

  useEffect(
    function autoScrollOnNewContent() {
      if (isAutoScroll) scrollToBottom("auto");
    },
    [isAutoScroll, scrollToBottom, ...triggerKeys],
  );

  const recomputeDistanceFromBottom = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const distanceFromBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    setIsFarFromBottom(distanceFromBottom > 100);
  }, []);

  useEffect(() => {
    recomputeDistanceFromBottom();
  }, [recomputeDistanceFromBottom, ...triggerKeys]);

  const onScroll = useCallback(() => {
    recomputeDistanceFromBottom();
  }, [recomputeDistanceFromBottom]);

  return {
    scrollContainerRef,
    bottomRef,
    isAutoScroll,
    isFarFromBottom,
    onScroll,
    enableAutoScroll,
    scrollToBottom,
  } as const;
}

export function ChatMessages() {
  const { selectedProject } = useProject();
  const {
    currentChatId,
    setCurrentChatId,
    setConversation,
    getCurrentConversation,
    setConversationTitle,
    getCurrentChat,
  } = usePersistentChat();

  const activeChatIdRef = useRef<string | null>(null);
  const shouldGenerateTitleRef = useRef<boolean>(false);

  const { setDocumentIds, clear } = useGraphHighlights();

  // Chat mode: simple | agentic | deep (default: simple)
  const [mode, setMode] = useState<"simple" | "agentic" | "deep">("simple");
  // Model selection: google/gemini or xai/grok (default: grok)
  const [model, setModel] = useState<string>("xai/grok-4-fast");
  // Project scoping for chat (defaults to global selection or All Projects)
  const [project, setProject] = useState<string>(
    selectedProject && selectedProject !== "sm_project_default"
      ? selectedProject
      : "__ALL__",
  );
  // Expanded context toggle (increases search result limits)
  const [expandContext, setExpandContext] = useState<boolean>(false);
  const [projects, setProjects] = useState<
    Array<{ id: string; name: string; containerTag: string }>
  >([]);
  const [loadingProjects, setLoadingProjects] = useState(false);

  useEffect(() => {
    let ignore = false;
    async function load() {
      try {
        setLoadingProjects(true);
        const res = await fetch(`${BACKEND_URL}/v3/projects`, {
          credentials: "include",
          headers: { "Content-Type": "application/json" },
        });
        if (!res.ok) return;
        const data = await res.json();
        if (ignore) return;
        const list = Array.isArray(data?.projects) ? data.projects : [];
        setProjects(
          list.map((p: any) => ({
            id: String(p.id),
            name: String(p.name ?? "Untitled Project"),
            containerTag: String(p.containerTag),
          })),
        );
      } catch {
        // noop
      } finally {
        if (!ignore) setLoadingProjects(false);
      }
    }
    load();
    return () => {
      ignore = true;
    };
  }, []);

  // Keep chat project in sync when global selection switches from default to a real project
  useEffect(() => {
    if (
      selectedProject &&
      selectedProject !== "sm_project_default" &&
      project === "__ALL__"
    ) {
      setProject(selectedProject);
    }
  }, [selectedProject]);

  // Create transport with useMemo so it updates when mode or model changes
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: `${BACKEND_URL}/chat/v2`,
        credentials: "include",
        body: {
          mode,
          model,
          metadata: {
            ...(project && project !== "__ALL__" ? { projectId: project } : {}),
            ...(expandContext ? { expandContext: true } : {}),
          },
        },
      }),
    [mode, model, project, expandContext],
  );

  const { messages, sendMessage, status, stop, setMessages, id, regenerate } =
    useChat({
      id: currentChatId ? `${currentChatId}::${mode}` : undefined,
      transport,
      maxSteps: 8,
      onFinish: (result) => {
        const activeId = activeChatIdRef.current;
        if (!activeId) return;
        if (result.message.role !== "assistant") return;

        if (shouldGenerateTitleRef.current) {
          const textPart = result.message.parts.find((part) =>
            isTextPart(part),
          );
          const text = textPart?.text.trim();
          if (text) {
            shouldGenerateTitleRef.current = false;
            complete(text);
          }
        }
      },
    });

  const [input, setInput] = useState("");
  const [savingInput, setSavingInput] = useState(false);
  const [savingMessageIds, setSavingMessageIds] = useState<Set<string>>(
    new Set(),
  );

  // Reset conversation when project changes to avoid cross-project context bleed
  useEffect(() => {
    setMessages([]);
    shouldGenerateTitleRef.current = false;
  }, [project, setMessages]);

  async function saveMemory(content: string) {
    const trimmed = content.trim();
    if (!trimmed) {
      toast.error("Nothing to save");
      return;
    }
    if (selectedProject === DEFAULT_PROJECT_ID) {
      toast.error("Select a project to save");
      return;
    }
    try {
      const res = await fetch(`${BACKEND_URL}/v3/documents`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: trimmed,
          containerTags:
            selectedProject && selectedProject !== DEFAULT_PROJECT_ID
              ? [selectedProject]
              : undefined,
          metadata: {
            source: "chat",
            type: "text",
            from_chat: true,
            projectId: selectedProject,
          },
        }),
      });
      if (!res.ok) {
        let msg = "Failed to save memory";
        try {
          const data = await res.json();
          msg = data?.error?.message || msg;
        } catch {}
        throw new Error(msg);
      }
      toast.success("Memory added");
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Failed to save memory");
    }
  }

  useEffect(() => {
    const baseId = id ? id.split("::")[0] : null;
    activeChatIdRef.current = currentChatId ?? baseId;
  }, [currentChatId, id]);

  useEffect(() => {
    const baseId = id?.split("::")[0];
    if (baseId && baseId !== currentChatId) {
      setCurrentChatId(baseId);
    }
  }, [id, currentChatId, setCurrentChatId]);

  useEffect(() => {
    const rawActiveId = (currentChatId ?? id)?.split("::")[0];
    const msgs = getCurrentConversation();
    setMessages(msgs ?? []);
    setInput("");
    if (!rawActiveId) {
      shouldGenerateTitleRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentChatId]);

  useEffect(() => {
    const rawActiveId = (currentChatId ?? id)?.split("::")[0];
    if (rawActiveId && messages.length > 0) {
      setConversation(rawActiveId, messages);
    }
  }, [messages, currentChatId, id, setConversation]);

  const { complete } = useCompletion({
    api: `${BACKEND_URL}/chat/title`,
    credentials: "include",
    onFinish: (_, completion) => {
      const activeId = activeChatIdRef.current;
      if (!completion || !activeId) return;
      setConversationTitle(activeId, completion.trim());
    },
  });

  // Update graph highlights from the most recent tool-searchMemories output
  useEffect(() => {
    try {
      const lastAssistant = [...messages]
        .reverse()
        .find((m) => m.role === "assistant");
      if (!lastAssistant) {
        clear();
        return;
      }
      const lastSearchPart = [...lastAssistant.parts]
        .reverse()
        .find((part) => isSearchMemoriesOutputPart(part));
      if (!lastSearchPart) {
        clear();
        return;
      }
      const ids = toMemoryResults(lastSearchPart.output?.results)
        .map((result) => result.documentId)
        .filter((id): id is string => typeof id === "string");
      if (ids.length > 0) {
        setDocumentIds(ids);
        return;
      }
    } catch {}
    clear();
  }, [messages, setDocumentIds, clear]);

  useEffect(() => {
    const currentSummary = getCurrentChat();
    const hasTitle = Boolean(
      currentSummary?.title && currentSummary.title.trim().length > 0,
    );
    shouldGenerateTitleRef.current = !hasTitle;
  }, [getCurrentChat]);
  const {
    scrollContainerRef,
    bottomRef,
    isFarFromBottom,
    onScroll,
    enableAutoScroll,
    scrollToBottom,
  } = useStickyAutoScroll([messages, status]);

  return (
    <>
      <div className="relative grow">
        <div
          className="flex flex-col gap-2 absolute inset-0 overflow-y-auto px-4 pt-4 pb-7 scroll-pb-7"
          onScroll={onScroll}
          ref={scrollContainerRef}
        >
          {messages.map((message) => (
            <div
              className={cn(
                "flex flex-col",
                message.role === "user" ? "items-end" : "items-start",
              )}
              key={message.id}
            >
              <div className="flex flex-col gap-2 max-w-4/5 bg-white/10 py-3 px-4 rounded-lg">
                {message.parts.map((part, index) => {
                  if (isTextPart(part)) {
                    return (
                      <div key={`${message.id}-text-${index}`}>
                        <Streamdown>{part.text}</Streamdown>
                      </div>
                    );
                  }

                  if (isSearchMemoriesPart(part)) {
                    switch (part.state) {
                      case "input-available":
                      case "input-streaming":
                        return (
                          <div
                            className="text-sm flex items-center gap-2 text-muted-foreground"
                            key={`${message.id}-search-${index}`}
                          >
                            <Spinner className="size-4" /> Searching memories...
                          </div>
                        );
                      case "output-error":
                        return (
                          <div
                            className="text-sm flex items-center gap-2 text-muted-foreground"
                            key={`${message.id}-search-${index}`}
                          >
                            <X className="size-4" /> Error recalling memories
                          </div>
                        );
                      case "output-available": {
                        const countValue = part.output?.count;
                        const foundCount =
                          typeof countValue === "number"
                            ? countValue
                            : typeof countValue === "string"
                              ? Number(countValue)
                              : 0;
                        const results = toMemoryResults(part.output?.results);

                        return (
                          <ExpandableMemories
                            foundCount={foundCount}
                            key={`${message.id}-search-${index}`}
                            results={results}
                          />
                        );
                      }
                      default:
                        return null;
                    }
                  }

                  if (isAddMemoryPart(part)) {
                    switch (part.state) {
                      case "input-available":
                      case "input-streaming":
                        return (
                          <div
                            className="text-sm flex items-center gap-2 text-muted-foreground"
                            key={`${message.id}-add-${index}`}
                          >
                            <Spinner className="size-4" /> Adding memory...
                          </div>
                        );
                      case "output-error":
                        return (
                          <div
                            className="text-sm flex items-center gap-2 text-muted-foreground"
                            key={`${message.id}-add-${index}`}
                          >
                            <X className="size-4" /> Error adding memory
                          </div>
                        );
                      case "output-available":
                        return (
                          <div
                            className="text-sm flex items-center gap-2 text-muted-foreground"
                            key={`${message.id}-add-${index}`}
                          >
                            <Check className="size-4" /> Memory added
                          </div>
                        );
                      default:
                        return null;
                    }
                  }

                  return null;
                })}
              </div>
              {message.role === "assistant" && (
                <div className="flex items-center gap-0.5 mt-0.5">
                  <Button
                    className="size-7 text-muted-foreground hover:text-foreground"
                    onClick={() => {
                      const combinedText = message.parts
                        .filter((part) => isTextPart(part))
                        .map((part) => part.text)
                        .join("\n");
                      navigator.clipboard.writeText(combinedText);
                      toast.success("Copied to clipboard");
                    }}
                    size="icon"
                    variant="ghost"
                  >
                    <Copy className="size-3.5" />
                  </Button>
                  <Button
                    className="size-6 text-muted-foreground hover:text-foreground"
                    onClick={async () => {
                      const id = message.id;
                      if (!id) return;
                      if (savingMessageIds.has(id)) return;
                      const combinedText = message.parts
                        .filter((part) => isTextPart(part))
                        .map((part) => part.text)
                        .join("\n");
                      setSavingMessageIds((prev) => new Set(prev).add(id));
                      try {
                        await saveMemory(combinedText);
                      } finally {
                        setSavingMessageIds((prev) => {
                          const next = new Set(prev);
                          next.delete(id);
                          return next;
                        });
                      }
                    }}
                    size="icon"
                    variant="ghost"
                    disabled={
                      message.id ? savingMessageIds.has(message.id) : false
                    }
                    title="Add this reply to memory"
                  >
                    {message.id && savingMessageIds.has(message.id) ? (
                      <Spinner className="size-3.5" />
                    ) : (
                      <Plus className="size-3.5" />
                    )}
                  </Button>
                  <Button
                    className="size-6 text-muted-foreground hover:text-foreground"
                    onClick={() => regenerate({ messageId: message.id })}
                    size="icon"
                    variant="ghost"
                  >
                    <RotateCcw className="size-3.5" />
                  </Button>
                </div>
              )}
            </div>
          ))}
          {status === "submitted" && (
            <div className="flex text-muted-foreground justify-start gap-2 px-4 py-3 items-center w-full">
              <Spinner className="size-4" />
              <TextShimmer className="text-sm" duration={1.5}>
                Thinking...
              </TextShimmer>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <Button
          className={cn(
            "rounded-full w-fit mx-auto shadow-md z-10 absolute inset-x-0 bottom-4 flex justify-center",
            "transition-all duration-200 ease-out",
            isFarFromBottom
              ? "opacity-100 scale-100 pointer-events-auto"
              : "opacity-0 scale-95 pointer-events-none",
          )}
          onClick={() => {
            enableAutoScroll();
            scrollToBottom("smooth");
          }}
          size="sm"
          type="button"
          variant="default"
        >
          Scroll to bottom
        </Button>
      </div>

      <form
        className="px-4 pb-4 pt-1 relative"
        onSubmit={(e) => {
          e.preventDefault();
          if (status === "submitted") return;
          if (status === "streaming") {
            stop();
            return;
          }
          if (input.trim()) {
            enableAutoScroll();
            scrollToBottom("auto");
            sendMessage({ text: input });
            setInput("");
          }
        }}
      >
        <div className="absolute top-0 left-0 -mt-7 w-full h-7 bg-gradient-to-t from-background to-transparent" />
        <InputGroup>
          <InputGroupTextarea
            disabled={status === "submitted"}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask, Search or Chat..."
            value={input}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (input.trim() && status !== "submitted") {
                  enableAutoScroll();
                  scrollToBottom("auto");
                  sendMessage({ text: input });
                  setInput("");
                }
              }
            }}
          />
          {/* Left bottom corner: quick-save button */}
          <InputGroupAddon align="inline-start" className="gap-1 bottom-0">
            <InputGroupButton
              type="button"
              variant="ghost"
              size="sm"
              disabled={savingInput || status === "submitted"}
              className="h-6 w-6 p-0"
              onClick={async () => {
                if (!input.trim()) {
                  toast.error("Type something to save");
                  return;
                }
                setSavingInput(true);
                try {
                  await saveMemory(input);
                } finally {
                  setSavingInput(false);
                }
              }}
            >
              {savingInput ? (
                <Spinner className="size-3.5" />
              ) : (
                <Plus className="size-3.5" />
              )}
            </InputGroupButton>
          </InputGroupAddon>

          {/* Right bottom corner: selectors together + send */}
          <InputGroupAddon align="inline-end" className="gap-1 bottom-0">
            <Select
              value={model}
              onValueChange={setModel}
              disabled={status === "submitted"}
            >
              <SelectTrigger className="h-6 min-w-[72px] text-[11px] px-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-md">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-black/90 backdrop-blur-xl border-white/10">
                <SelectItem value="xai/grok-4-fast">Grok</SelectItem>
                <SelectItem value="google/gemini-2.5-flash-preview-09-2025">
                  Gemini
                </SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={mode}
              onValueChange={setMode}
              disabled={status === "submitted"}
            >
              <SelectTrigger className="h-6 min-w-[80px] text-[11px] px-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-md">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-black/90 backdrop-blur-xl border-white/10">
                <SelectItem value="simple">Simple</SelectItem>
                <SelectItem value="agentic">Agentic</SelectItem>
                <SelectItem value="deep">Deep</SelectItem>
              </SelectContent>
            </Select>

            <InputGroupButton
              type="submit"
              size="sm"
              className="h-7 w-7 p-0"
              disabled={status === "submitted"}
            >
              {status === "ready" ? (
                <ArrowUp className="size-3.5" />
              ) : status === "submitted" ? (
                <Spinner className="size-3.5" />
              ) : (
                <X className="size-3.5" />
              )}
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
      </form>
    </>
  );
}
