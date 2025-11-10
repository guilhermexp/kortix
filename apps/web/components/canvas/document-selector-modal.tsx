"use client";

import { cn } from "@lib/utils";
import { $fetch } from "@repo/lib/api";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/dialog";
import { Input } from "@repo/ui/components/input";
import type { DocumentsWithMemoriesResponseSchema } from "@repo/validation/api";
import { Brain, Search, Sparkles, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { z } from "zod";
import { getDocumentIcon } from "@/lib/document-icon";
import { useProject } from "@/stores";
import { useCanvasSelection } from "@/stores/canvas";
import { formatDate } from "../memories";
import { getDocumentSnippet, stripMarkdown } from "../memories";

type DocumentsResponse = z.infer<typeof DocumentsWithMemoriesResponseSchema>;
type DocumentWithMemories = DocumentsResponse["documents"][0];

interface DocumentSelectorModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DocumentSelectorModal({
  open,
  onOpenChange,
}: DocumentSelectorModalProps) {
  const { selectedProject } = useProject();
  const { addPlacedDocuments, placedDocumentIds } = useCanvasSelection();

  const [documents, setDocuments] = useState<DocumentWithMemories[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [totalCount, setTotalCount] = useState(0);

  const ITEMS_PER_PAGE = 20;

  // Fetch documents from the current project
  const fetchDocuments = useCallback(
    async (pageNum: number, append = false) => {
      setIsLoading(true);
      setError(null);

      try {
        const containerTags =
          selectedProject && selectedProject !== "sm_project_default"
            ? [selectedProject]
            : undefined;

        const response = await $fetch("@post/documents/documents", {
          body: {
            containerTags,
            limit: ITEMS_PER_PAGE,
            page: pageNum,
            sort: "updatedAt",
            order: "desc",
          },
          disableValidation: true,
        });

        if (response.data) {
          const newDocs = response.data.documents;
          setDocuments((prev) => (append ? [...prev, ...newDocs] : newDocs));
          setTotalCount(response.data.pagination.totalItems);
          setHasMore(
            response.data.pagination.currentPage <
              response.data.pagination.totalPages,
          );
        }
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to fetch documents",
        );
      } finally {
        setIsLoading(false);
      }
    },
    [selectedProject],
  );

  // Reset and fetch on open or project change
  useEffect(() => {
    if (open) {
      setPage(1);
      setSelectedIds(new Set());
      setSearchQuery("");
      fetchDocuments(1, false);
    }
  }, [open, fetchDocuments]);

  // Filter documents based on search query
  const filteredDocuments = useMemo(() => {
    if (!searchQuery.trim()) return documents;

    const query = searchQuery.toLowerCase();
    return documents.filter(
      (doc) =>
        doc.title?.toLowerCase().includes(query) ||
        doc.content?.toLowerCase().includes(query) ||
        doc.url?.toLowerCase().includes(query),
    );
  }, [documents, searchQuery]);

  // Filter out already placed documents
  const availableDocuments = useMemo(() => {
    return filteredDocuments.filter(
      (doc) => !placedDocumentIds.includes(doc.id),
    );
  }, [filteredDocuments, placedDocumentIds]);

  // Handle select/deselect individual document
  const toggleDocumentSelection = useCallback((docId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(docId)) {
        next.delete(docId);
      } else {
        next.add(docId);
      }
      return next;
    });
  }, []);

  // Handle select all
  const handleSelectAll = useCallback(() => {
    if (selectedIds.size === availableDocuments.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(availableDocuments.map((doc) => doc.id)));
    }
  }, [availableDocuments, selectedIds.size]);

  // Handle load more
  const handleLoadMore = useCallback(() => {
    if (!isLoading && hasMore) {
      const nextPage = page + 1;
      setPage(nextPage);
      fetchDocuments(nextPage, true);
    }
  }, [isLoading, hasMore, page, fetchDocuments]);

  // Handle confirm selection
  const handleConfirm = useCallback(() => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;

    addPlacedDocuments(ids);
    setSelectedIds(new Set());
    onOpenChange(false);
  }, [selectedIds, addPlacedDocuments, onOpenChange]);

  // Handle cancel
  const handleCancel = useCallback(() => {
    setSelectedIds(new Set());
    onOpenChange(false);
  }, [onOpenChange]);

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-w-4xl h-[85vh] flex flex-col overflow-hidden bg-popover/95 backdrop-blur-xl border border-border">
        <DialogHeader className="pb-4 border-b border-border">
          <DialogTitle className="text-lg font-semibold text-foreground">
            Add Documents to Canvas
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            Select documents from your workspace to include in the Infinity
            Canvas. The chat will focus on the memories of the documents you
            add.
          </DialogDescription>
        </DialogHeader>

        {/* Toolbar */}
        <div className="flex flex-col gap-3 pb-4 md:flex-row md:items-center md:justify-between">
          <div className="relative w-full md:max-w-md">
            <Input
              className="pl-10 text-sm bg-muted/40 border-border/70 focus-visible:ring-offset-0"
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search documents by title or content..."
              value={searchQuery}
            />
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/70"
              strokeWidth={2}
            />
          </div>

          <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground md:justify-end">
            <Button
              className="text-xs border-border/70"
              onClick={handleSelectAll}
              size="sm"
              variant="outline"
            >
              {selectedIds.size === availableDocuments.length
                ? "Clear Selection"
                : "Select All"}
            </Button>
            <div className="flex items-center gap-1.5 text-xs">
              <span className="tabular-nums">{selectedIds.size}</span>
              <span className="text-muted-foreground/60">selected</span>
              <span className="text-muted-foreground/40">·</span>
              <span className="tabular-nums">{totalCount}</span>
              <span className="text-muted-foreground/60">total</span>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden">
          <div className="h-full overflow-y-auto pr-1">
            {error ? (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-center text-destructive">
                <Sparkles className="w-6 h-6" />
                <p>{error}</p>
                <Button onClick={() => fetchDocuments(page, false)} size="sm">
                  Try again
                </Button>
              </div>
            ) : isLoading && documents.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-center text-muted-foreground">
                <Sparkles className="w-6 h-6 animate-spin" />
                <p>Loading documents...</p>
              </div>
            ) : availableDocuments.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-center text-muted-foreground">
                <X className="w-6 h-6" />
                <p>No documents available to add</p>
              </div>
            ) : (
              <>
                <div className="flex flex-col gap-2">
                  {availableDocuments.map((document) => {
                    const isSelected = selectedIds.has(document.id);
                    const activeMemories = document.memoryEntries.filter(
                      (memory) => (memory as any).status !== "archived",
                    );
                    const snippet = getDocumentSnippet(document);

                    return (
                      <button
                        key={document.id}
                        className={cn(
                          "group flex w-full items-start gap-3 rounded-xl border border-border/70 bg-card/80 px-4 py-3 text-left transition-colors hover:border-foreground/20 hover:bg-card",
                          isSelected &&
                            "border-primary/60 bg-primary/10 hover:bg-primary/10",
                        )}
                        onClick={() => toggleDocumentSelection(document.id)}
                        type="button"
                      >
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-muted/40 text-muted-foreground">
                          {getDocumentIcon(document.type, "h-4 w-4")}
                        </div>
                        <div className="min-w-0 flex-1 space-y-2">
                          <div className="flex flex-col gap-1">
                            <div className="flex items-start justify-between gap-2">
                              <p
                                className="text-sm font-semibold text-foreground line-clamp-2"
                                title={
                                  (() => {
                                    const raw = document.title || "";
                                    const isData = raw.startsWith("data:");
                                    const cleaned = stripMarkdown(raw)
                                      .trim()
                                      .replace(/^[\'"“”‘’`]+|[\'"“”‘’`]+$/g, "");
                                    return isData || !cleaned
                                      ? "Untitled Document"
                                      : cleaned;
                                  })()
                                }
                              >
                                {(() => {
                                  const raw = document.title || "";
                                  const isData = raw.startsWith("data:");
                                  const cleaned = stripMarkdown(raw)
                                    .trim()
                                    .replace(/^[\'"“”‘’`]+|[\'"“”‘’`]+$/g, "");
                                  return isData || !cleaned
                                    ? "Untitled Document"
                                    : cleaned;
                                })()}
                              </p>
                              <span
                                className={cn(
                                  "inline-flex items-center rounded-full border border-border/80 px-1.5 py-0.5 text-[10px] font-normal text-muted-foreground",
                                  isSelected &&
                                    "border-primary/50 bg-primary/20 text-primary",
                                )}
                              >
                                {isSelected
                                  ? "Selected"
                                  : formatDate(
                                      document.updatedAt || document.createdAt,
                                    )}
                              </span>
                            </div>
                            {snippet && !snippet.startsWith("data:") && (
                              <p className="text-xs text-muted-foreground/90 line-clamp-2">
                                {snippet}
                              </p>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground/80">
                            {activeMemories.length > 0 && (
                              <Badge
                                className="border-none bg-primary/15 text-primary"
                                variant="secondary"
                              >
                                <Brain className="mr-1 h-3 w-3" />
                                {activeMemories.length}{" "}
                                {activeMemories.length === 1
                                  ? "memory"
                                  : "memories"}
                              </Badge>
                            )}
                            {document.type && (
                              <Badge
                                className="border border-border/70 bg-transparent text-muted-foreground/80"
                                variant="outline"
                              >
                                {document.type}
                              </Badge>
                            )}
                            {document.url && (
                              <span className="truncate text-[11px] text-muted-foreground/70">
                                {document.url.replace(/^https?:\/\//, "")}
                              </span>
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {hasMore && (
                  <div className="mt-4 flex justify-center">
                    <Button
                      className="min-w-[12rem] border-border/70"
                      disabled={isLoading}
                      onClick={handleLoadMore}
                      variant="outline"
                    >
                      {isLoading ? (
                        <>
                          <Sparkles className="mr-2 h-4 w-4 animate-spin" />
                          Loading more...
                        </>
                      ) : (
                        `Load More (${Math.max(
                          totalCount - documents.length,
                          0,
                        )} remaining)`
                      )}
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Footer */}
        <DialogFooter className="border-t border-border pt-4">
          <Button
            className="border-border/70"
            onClick={handleCancel}
            variant="outline"
          >
            Cancel
          </Button>
          <Button
            disabled={selectedIds.size === 0}
            onClick={handleConfirm}
            variant="default"
          >
            Add {selectedIds.size > 0 && `(${selectedIds.size})`} to Canvas
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
