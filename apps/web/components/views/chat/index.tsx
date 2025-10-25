"use client";

import { cn } from "@lib/utils";
import { Button } from "@ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@ui/components/dialog";
import { ScrollArea } from "@ui/components/scroll-area";
import { formatDistanceToNow } from "date-fns";
import { HistoryIcon, Plus, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { analytics } from "@/lib/analytics";
import { useChatOpen, usePersistentChat, useProject } from "@/stores";
import { ChatMessages } from "./chat-messages";

export function ChatRewrite() {
  const { setIsOpen } = useChatOpen();
  const { selectedProject } = useProject();
  const {
    conversations,
    currentChatId,
    setCurrentChatId,
    deleteConversation,
    getCurrentChat,
  } = usePersistentChat();

  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const sorted = useMemo(() => {
    return [...conversations].sort((a, b) =>
      a.lastUpdated < b.lastUpdated ? 1 : -1,
    );
  }, [conversations]);

  function handleNewChat() {
    analytics.newChatStarted();
    const newId = crypto.randomUUID();
    setCurrentChatId(newId);
    setIsDialogOpen(false);
  }

  function formatRelativeTime(isoString: string): string {
    return formatDistanceToNow(new Date(isoString), { addSuffix: true });
  }

  // No header controls (kept only in composer)

  return (
    <div className="flex flex-col h-full overflow-y-hidden border-l border-white/10 bg-[#0f1419]">
      <div className="sticky top-0 z-20 border-b border-white/10 bg-[#0f1419]/90 backdrop-blur px-4 py-3 flex justify-between items-center shadow-sm">
        <h3 className="text-base font-semibold line-clamp-1 text-ellipsis overflow-hidden text-white/90">
          {getCurrentChat()?.title ?? "New Chat"}
        </h3>
        <div className="flex items-center gap-2">
          <Dialog onOpenChange={setIsDialogOpen} open={isDialogOpen}>
            <DialogTrigger asChild>
              <Button
                onClick={() => analytics.chatHistoryViewed()}
                size="icon"
                className="h-8 w-8 bg-white/5 hover:bg-white/10 border border-white/10 rounded-md text-white/80"
                variant="ghost"
              >
                <HistoryIcon className="size-4" />
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg bg-[#0f1419] backdrop-blur-xl border-white/10 text-white">
              <DialogHeader className="pb-4 border-b border-white/10 rounded-t-lg">
                <DialogTitle className="text-white">Conversations</DialogTitle>
                <DialogDescription className="text-white/50">
                  Project{" "}
                  <span className="font-mono font-medium text-white/70">
                    {selectedProject}
                  </span>
                </DialogDescription>
              </DialogHeader>

              <ScrollArea className="max-h-96">
                <div className="flex flex-col gap-1">
                  {sorted.map((c) => {
                    const isActive = c.id === currentChatId;
                    return (
                      <div
                        aria-current={isActive ? "true" : undefined}
                        className={cn(
                          "group flex items-center justify-between rounded-md px-3 py-2",
                          "transition-colors",
                          isActive ? "bg-primary/10" : "hover:bg-muted",
                        )}
                        key={c.id}
                      >
                        <button
                          className="min-w-0 flex-1 text-left outline-none"
                          onClick={() => {
                            setCurrentChatId(c.id);
                            setIsDialogOpen(false);
                          }}
                          type="button"
                        >
                          <div className="flex items-center gap-2">
                            <span
                              className={cn(
                                "text-sm font-medium truncate",
                                isActive ? "text-foreground" : undefined,
                              )}
                            >
                              {c.title || "Untitled Chat"}
                            </span>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Last updated {formatRelativeTime(c.lastUpdated)}
                          </div>
                        </button>
                        <Button
                          aria-label="Delete conversation"
                          onClick={(e) => {
                            e.stopPropagation();
                            analytics.chatDeleted();
                            if (isActive) {
                              setCurrentChatId(null);
                            }
                            deleteConversation(c.id);
                          }}
                          size="icon"
                          type="button"
                          variant="ghost"
                        >
                          <Trash2 className="size-4 text-muted-foreground" />
                        </Button>
                      </div>
                    );
                  })}
                  {sorted.length === 0 && (
                    <div className="text-xs text-muted-foreground px-3 py-2">
                      No conversations yet
                    </div>
                  )}
                </div>
              </ScrollArea>
              <Button
                className="w-full border-dashed"
                onClick={handleNewChat}
                size="lg"
                variant="outline"
              >
                <Plus className="size-4 mr-1" /> New Conversation
              </Button>
            </DialogContent>
          </Dialog>
          <Button
            onClick={handleNewChat}
            size="icon"
            className="h-8 w-8 bg-white/5 hover:bg-white/10 border border-white/10 rounded-md text-white/80"
            variant="ghost"
          >
            <Plus className="size-4" />
          </Button>
          <Button
            onClick={() => setIsOpen(false)}
            size="icon"
            className="h-8 w-8 bg-white/5 hover:bg-white/10 border border-white/10 rounded-md text-white/80"
            variant="ghost"
          >
            <X className="size-4" />
          </Button>
        </div>
      </div>
      <ChatMessages />
    </div>
  );
}
