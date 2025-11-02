"use client";

import { Eye } from "lucide-react";
import React, { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "../button";
import { Card, CardContent } from "../card";
import { AddBlockButton } from "./add-block-button";
import { Block } from "./block";
import { CustomClassPopover } from "./custom-class-popover";
import { EditorToolbar } from "./editor-toolbar";
import { GroupImagesButton } from "./group-images-button";
import {
  createHandleBlockDragStart,
  createHandleDragEnter,
  createHandleDragLeave,
  createHandleDragOver,
  createHandleDrop,
  createHandleImageDragStart,
} from "./handlers/drag-drop-handlers";
import {
  createHandleFileChange,
  createHandleImageUploadClick,
  createHandleMultipleFilesChange,
  createHandleMultipleImagesUploadClick,
} from "./handlers/file-upload-handlers";
import {
  createHandleFlexContainerDragLeave,
  createHandleFlexContainerDragOver,
  createHandleFlexContainerDrop,
} from "./handlers/flex-container-handlers";
import {
  checkImagesInSameFlex,
  createHandleClearImageSelection,
  createHandleExtractFromFlex,
  createHandleGroupSelectedImages,
  createHandleReverseImagesInFlex,
  createHandleToggleImageSelection,
} from "./handlers/image-selection-handlers";
import {
  createHandleClickWithModifier,
  createHandleContentChange,
  createHandleKeyDown,
} from "./handlers/keyboard-handlers";
import {
  createHandleAddBlock,
  createHandleChangeBlockType,
  createHandleCopyHtml,
  createHandleCopyJson,
  createHandleCreateLink,
  createHandleCreateList,
  createHandleCreateListFromCommand,
  createHandleCreateNested,
  createHandleCreateTable,
  createHandleDeleteNode,
  createHandleInsertImageFromCommand,
  createHandleNodeClick,
} from "./handlers/node-operation-handlers";
// Import all handlers
import {
  createHandleApplyColor,
  createHandleApplyFontSize,
  createHandleFormat,
  createHandleSelectionChange,
  createHandleTypeChange,
} from "./handlers/selection-handlers";
import { useToast } from "./hooks/use-toast";
import {
  type ContainerNode,
  EditorActions,
  type EditorNode,
  type EditorState,
  findNodeById,
  getNodeTextContent,
  hasInlineChildren,
  isContainerNode,
  isTextNode,
  type SelectionInfo,
  serializeToHtml,
  type TextNode,
  useEditor,
  useSelection,
  useSelectionManager,
} from "./index";
import { LinkPopover } from "./link-popover";
import { TableBuilder } from "./table-builder";
import { TableDialog } from "./table-dialog";
import { useDragAutoScroll } from "./utils/drag-auto-scroll";

/**
 * Editor Component Props
 */
interface EditorProps {
  readOnly?: boolean; // View-only mode - renders content without editing capabilities
  onUploadImage?: (file: File) => Promise<string>; // Custom image upload handler - should return the uploaded image URL
}

export function Editor({
  readOnly: initialReadOnly = false,
  onUploadImage,
}: EditorProps = {}) {
  const [state, dispatch] = useEditor();
  const selectionManager = useSelectionManager();
  const { toast } = useToast();
  const lastEnterTime = useRef<number>(0);
  const nodeRefs = useRef<Map<string, HTMLElement>>(new Map());
  const contentUpdateTimers = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const multipleFileInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const editorContentRef = useRef<HTMLDivElement>(null);
  const [readOnly, setReadOnly] = useState(initialReadOnly);

  // Enable auto-scroll when dragging near viewport edges
  useDragAutoScroll(editorContentRef, {
    scrollZone: 100,
    scrollSpeed: 15,
    enableVertical: true,
    enableHorizontal: false,
  });

  const [isUploading, setIsUploading] = useState(false);
  const [copiedHtml, setCopiedHtml] = useState(false);
  const [copiedJson, setCopiedJson] = useState(false);
  const [enhanceSpaces, setEnhanceSpaces] = useState(true);
  const [dragOverNodeId, setDragOverNodeId] = useState<string | null>(null);
  const [dropPosition, setDropPosition] = useState<
    "before" | "after" | "left" | "right" | null
  >(null);
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const [selectedColor, setSelectedColor] = useState<string>("");
  const [selectedImageIds, setSelectedImageIds] = useState<Set<string>>(
    new Set(),
  );
  const [dragOverFlexId, setDragOverFlexId] = useState<string | null>(null);
  const [flexDropPosition, setFlexDropPosition] = useState<
    "left" | "right" | null
  >(null);
  const [tableDialogOpen, setTableDialogOpen] = useState(false);

  // Get the current container from history
  // Safety: history always has at least one item (initialized in createInitialState)
  const container = state.history[state.historyIndex] ?? state.history[0]!;

  const currentNode = state.activeNodeId
    ? (container.children.find((n) => n.id === state.activeNodeId) as
        | TextNode
        | undefined)
    : (container.children[0] as TextNode | undefined);

  // Debounced dispatch for selection state updates
  const selectionDispatchTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Create handler parameters
  const selectionParams = {
    container,
    state,
    dispatch,
    selectionManager,
    nodeRefs,
  };

  // keyboardParams will be created dynamically with the handlers

  const nodeOperationParams = {
    container,
    dispatch,
    toast,
    nodeRefs,
    editorContentRef,
  };

  const dragDropParams = {
    container,
    dispatch,
    toast,
    draggingNodeId,
    setDraggingNodeId,
    setDragOverNodeId,
    setDropPosition,
    setIsUploading,
    onUploadImage,
  };

  const fileUploadParams = {
    container,
    dispatch,
    state,
    toast,
    setIsUploading,
    fileInputRef,
    multipleFileInputRef,
    onUploadImage,
  };

  const videoUploadParams = {
    container,
    dispatch,
    state,
    toast,
    setIsUploading,
    fileInputRef: videoInputRef,
    multipleFileInputRef: videoInputRef, // Reuse the same ref for consistency
    onUploadImage,
  };

  // Create all handlers
  const handleSelectionChange = useCallback(
    createHandleSelectionChange(selectionParams, selectionDispatchTimerRef),
    [container, state.activeNodeId, selectionManager, dispatch],
  );

  const handleFormat = useCallback(createHandleFormat(selectionParams), [
    container,
    dispatch,
    selectionManager,
  ]);

  const handleApplyColor = useCallback(
    createHandleApplyColor(selectionParams, toast, setSelectedColor),
    [dispatch, selectionManager, toast],
  );

  const handleApplyFontSize = useCallback(
    createHandleApplyFontSize(selectionParams, toast),
    [dispatch, selectionManager, toast],
  );

  const handleTypeChange = useCallback(
    createHandleTypeChange(selectionParams, currentNode, handleSelectionChange),
    [currentNode, dispatch, selectionManager, handleSelectionChange],
  );

  const handleToggleImageSelection = useCallback(
    createHandleToggleImageSelection(selectedImageIds, setSelectedImageIds),
    [selectedImageIds],
  );

  const handleContentChange = useCallback(
    createHandleContentChange(
      {
        container,
        dispatch,
        nodeRefs,
        lastEnterTime,
        onToggleImageSelection: handleToggleImageSelection,
      },
      contentUpdateTimers,
    ),
    [container, dispatch, handleToggleImageSelection],
  );

  const handleKeyDown = useCallback(
    createHandleKeyDown({
      container,
      dispatch,
      nodeRefs,
      lastEnterTime,
      onToggleImageSelection: handleToggleImageSelection,
    }),
    [container, dispatch, nodeRefs, lastEnterTime, handleToggleImageSelection],
  );

  const handleClickWithModifier = useCallback(
    createHandleClickWithModifier({
      container,
      dispatch,
      nodeRefs,
      lastEnterTime,
      onToggleImageSelection: handleToggleImageSelection,
    }),
    [container, handleToggleImageSelection],
  );

  const handleNodeClick = useCallback(
    createHandleNodeClick({ container, dispatch }),
    [container, dispatch],
  );

  const handleDeleteNode = useCallback(
    createHandleDeleteNode({ container, dispatch, toast }),
    [container, dispatch, toast],
  );

  const handleAddBlock = useCallback(
    createHandleAddBlock({ dispatch, nodeRefs }),
    [dispatch, nodeRefs],
  );

  const handleCreateNested = useCallback(
    createHandleCreateNested({ container, dispatch, toast }),
    [container, dispatch, toast],
  );

  const handleChangeBlockType = useCallback(
    createHandleChangeBlockType({ dispatch, nodeRefs }),
    [dispatch, nodeRefs],
  );

  const handleInsertImageFromCommand = useCallback(
    createHandleInsertImageFromCommand({ dispatch, nodeRefs }, fileInputRef),
    [dispatch, fileInputRef],
  );

  const handleCreateList = useCallback(
    createHandleCreateList(nodeOperationParams),
    [container, dispatch, toast, editorContentRef],
  );

  const handleCreateListFromCommand = useCallback(
    createHandleCreateListFromCommand({ dispatch, toast, nodeRefs }),
    [dispatch, toast, nodeRefs],
  );

  const handleCreateLink = useCallback(
    createHandleCreateLink(nodeOperationParams),
    [container, dispatch, toast, editorContentRef],
  );

  const handleCreateTable = useCallback(
    createHandleCreateTable(nodeOperationParams),
    [container, dispatch, toast, editorContentRef],
  );

  const handleImportMarkdownTable = useCallback(
    (table: any) => {
      const timestamp = Date.now();

      // Wrap table in a container for consistent handling
      const tableWrapper: ContainerNode = {
        id: `table-wrapper-${timestamp}`,
        type: "container",
        children: [table],
        attributes: {},
      };

      // Insert the table at the end
      const lastNode = container.children[container.children.length - 1];
      if (lastNode) {
        dispatch(EditorActions.insertNode(tableWrapper, lastNode.id, "after"));
      } else {
        // If no nodes exist, replace the container
        dispatch(
          EditorActions.replaceContainer({
            ...container,
            children: [tableWrapper],
          }),
        );
      }

      toast({
        title: "Table Imported",
        description: "Markdown table has been imported successfully",
      });

      // Smooth scroll to the newly created table
      setTimeout(() => {
        const editorContent = editorContentRef.current;
        if (editorContent) {
          const lastChild = editorContent.querySelector(
            "[data-editor-content]",
          )?.lastElementChild;
          if (lastChild) {
            lastChild.scrollIntoView({
              behavior: "smooth",
              block: "end",
              inline: "nearest",
            });
          }
        }
      }, 150);
    },
    [container, dispatch, toast, editorContentRef],
  );

  const handleCopyHtml = useCallback(
    () =>
      createHandleCopyHtml({ toast }, enhanceSpaces, setCopiedHtml)(container),
    [container, enhanceSpaces, toast],
  );

  const handleCopyJson = useCallback(
    () => createHandleCopyJson({ toast }, setCopiedJson)(container),
    [container, toast],
  );

  const handleImageDragStart = useCallback(
    createHandleImageDragStart(setDraggingNodeId),
    [],
  );

  const handleBlockDragStart = useCallback(
    createHandleBlockDragStart(setDraggingNodeId),
    [],
  );

  const handleDragEnter = useCallback(createHandleDragEnter(), []);

  const handleDragOver = useCallback(
    createHandleDragOver({
      container,
      dispatch,
      draggingNodeId,
      setDraggingNodeId,
      setDragOverNodeId,
      setDropPosition,
    }),
    [container, draggingNodeId],
  );

  const handleDragLeave = useCallback(
    createHandleDragLeave(setDragOverNodeId, setDropPosition),
    [],
  );

  const handleDrop = useCallback(
    createHandleDrop(dragDropParams, dropPosition),
    [container, dispatch, toast, draggingNodeId, dropPosition, onUploadImage],
  );

  const handleFileChange = useCallback(
    createHandleFileChange(fileUploadParams),
    [container, dispatch, state, toast, onUploadImage],
  );

  const handleMultipleFilesChange = useCallback(
    createHandleMultipleFilesChange(fileUploadParams),
    [container, dispatch, state, toast, onUploadImage],
  );

  const handleImageUploadClick = useCallback(
    createHandleImageUploadClick(fileInputRef),
    [],
  );

  const handleMultipleImagesUploadClick = useCallback(
    createHandleMultipleImagesUploadClick(multipleFileInputRef),
    [],
  );

  const handleVideoUploadClick = useCallback(
    createHandleImageUploadClick(videoInputRef),
    [],
  );

  const handleVideoFileChange = useCallback(
    createHandleFileChange(videoUploadParams),
    [container, dispatch, state.activeNodeId, toast, onUploadImage],
  );

  const handleClearImageSelection = useCallback(
    createHandleClearImageSelection(setSelectedImageIds),
    [],
  );

  const handleGroupSelectedImages = useCallback(
    createHandleGroupSelectedImages(
      { container, dispatch, toast },
      selectedImageIds,
      handleClearImageSelection,
    ),
    [container, dispatch, toast, selectedImageIds, handleClearImageSelection],
  );

  // Check if selected images are in same flex container
  const flexInfo = React.useMemo(() => {
    if (selectedImageIds.size < 2) {
      return { inSameFlex: false, flexParentId: null };
    }
    return checkImagesInSameFlex(
      { container, dispatch, toast },
      selectedImageIds,
    );
  }, [container, selectedImageIds, dispatch, toast]);

  const handleReverseImagesInFlex = useCallback(
    createHandleReverseImagesInFlex(
      { container, dispatch, toast },
      selectedImageIds,
      flexInfo.flexParentId || "",
    ),
    [container, dispatch, toast, selectedImageIds, flexInfo.flexParentId],
  );

  const handleExtractFromFlex = useCallback(
    createHandleExtractFromFlex(
      { container, dispatch, toast },
      selectedImageIds,
      flexInfo.flexParentId || "",
      handleClearImageSelection,
    ),
    [
      container,
      dispatch,
      toast,
      selectedImageIds,
      flexInfo.flexParentId,
      handleClearImageSelection,
    ],
  );

  const handleFlexContainerDragOver = useCallback(
    createHandleFlexContainerDragOver({
      container,
      dispatch,
      toast,
      draggingNodeId,
      setDragOverFlexId,
      setFlexDropPosition,
    }),
    [container, dispatch, toast, draggingNodeId],
  );

  const handleFlexContainerDragLeave = useCallback(
    createHandleFlexContainerDragLeave(setDragOverFlexId, setFlexDropPosition),
    [],
  );

  const handleFlexContainerDrop = useCallback(
    createHandleFlexContainerDrop({
      container,
      dispatch,
      toast,
      draggingNodeId,
      setDragOverFlexId,
      setFlexDropPosition,
    }),
    [container, dispatch, toast, draggingNodeId],
  );

  // Selection change listener
  useEffect(() => {
    document.addEventListener("selectionchange", handleSelectionChange);
    return () => {
      document.removeEventListener("selectionchange", handleSelectionChange);
    };
  }, [handleSelectionChange]);

  // Focus on current node when it changes
  useEffect(() => {
    if (!state.activeNodeId) return;

    const activeId = state.activeNodeId;

    const attemptFocus = (retries = 0) => {
      const element = nodeRefs.current.get(activeId);

      if (element && document.activeElement !== element) {
        element.focus();
      } else if (!element && retries < 10) {
        setTimeout(() => attemptFocus(retries + 1), 50);
      } else if (!element) {
        console.error(
          "❌ [Focus Failed] Element not found after 10 retries:",
          activeId,
        );
      }
    };

    attemptFocus();
  }, [state.activeNodeId]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      contentUpdateTimers.current.forEach((timer) => clearTimeout(timer));
      contentUpdateTimers.current.clear();
    };
  }, []);

  // Handle global keyboard shortcuts
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const isCtrlOrCmd = e.ctrlKey || e.metaKey;

      const activeElement = document.activeElement;
      const isInEditor = Array.from(nodeRefs.current.values()).some(
        (el) => el === activeElement || el.contains(activeElement),
      );

      // Ctrl+A / Cmd+A - Select all content in current block only
      if (isCtrlOrCmd && e.key === "a" && isInEditor) {
        e.preventDefault();

        const selection = window.getSelection();
        if (!selection) return;

        const currentBlock = activeElement as HTMLElement;
        if (currentBlock && currentBlock.isContentEditable) {
          const range = document.createRange();
          range.selectNodeContents(currentBlock);
          selection.removeAllRanges();
          selection.addRange(range);
        }
      }

      // Ctrl+B / Cmd+B - Toggle Bold
      if (isCtrlOrCmd && e.key === "b" && isInEditor) {
        e.preventDefault();
        const selection = window.getSelection();
        if (selection && !selection.isCollapsed) {
          handleFormat("bold");
        }
      }

      // Ctrl+I / Cmd+I - Toggle Italic
      if (isCtrlOrCmd && e.key === "i" && isInEditor) {
        e.preventDefault();
        const selection = window.getSelection();
        if (selection && !selection.isCollapsed) {
          handleFormat("italic");
        }
      }

      // Ctrl+U / Cmd+U - Toggle Underline
      if (isCtrlOrCmd && e.key === "u" && isInEditor) {
        e.preventDefault();
        const selection = window.getSelection();
        if (selection && !selection.isCollapsed) {
          handleFormat("underline");
        }
      }

      // Ctrl+Z / Cmd+Z - Undo
      if (isCtrlOrCmd && e.key === "z" && !e.shiftKey) {
        if (
          !isInEditor &&
          (activeElement?.tagName === "INPUT" ||
            activeElement?.tagName === "TEXTAREA")
        ) {
          return;
        }
        e.preventDefault();
        if (state.historyIndex > 0) {
          dispatch(EditorActions.undo());
        }
      }

      // Ctrl+Y / Cmd+Y or Ctrl+Shift+Z - Redo
      if (
        (isCtrlOrCmd && e.key === "y") ||
        (isCtrlOrCmd && e.shiftKey && e.key === "z")
      ) {
        if (
          !isInEditor &&
          (activeElement?.tagName === "INPUT" ||
            activeElement?.tagName === "TEXTAREA")
        ) {
          return;
        }
        e.preventDefault();
        if (state.historyIndex < state.history.length - 1) {
          dispatch(EditorActions.redo());
        }
      }
    };

    document.addEventListener("keydown", handleGlobalKeyDown);
    return () => {
      document.removeEventListener("keydown", handleGlobalKeyDown);
    };
  }, [state.historyIndex, state.history.length, dispatch, toast, handleFormat]);

  return (
    <div className="bg-transparent flex flex-1 flex-col transition-colors duration-300">
      {/* Editor with integrated toolbar */}
      <div className="mx-auto flex w-full flex-1 flex-col">
        <Card className="bg-chat-surface flex flex-1 flex-col gap-3 rounded-2xl border border-border/80 pt-0 shadow-xl backdrop-blur-xl transition-all duration-300">
          {/* Toolbar - hidden in readOnly mode */}
          {!readOnly && (
            <EditorToolbar
              container={container}
              copiedHtml={copiedHtml}
              copiedJson={copiedJson}
              currentNode={currentNode}
              currentSelection={state.currentSelection}
              enhanceSpaces={enhanceSpaces}
              isUploading={isUploading}
              onColorSelect={handleApplyColor}
              onCopyHtml={handleCopyHtml}
              onCopyJson={handleCopyJson}
              onCreateLink={handleCreateLink}
              onCreateList={handleCreateList}
              onCreateTable={() => setTableDialogOpen(true)}
              onEnhanceSpacesChange={setEnhanceSpaces}
              onFontSizeSelect={handleApplyFontSize}
              onFormat={handleFormat}
              onImageUploadClick={handleImageUploadClick}
              onMultipleImagesUploadClick={handleMultipleImagesUploadClick}
              onTypeChange={handleTypeChange}
              onVideoUploadClick={handleVideoUploadClick}
              selectedColor={selectedColor}
            />
          )}

          {/* Table Dialog */}
          <TableDialog
            onCreateTable={handleCreateTable}
            onImportMarkdown={handleImportMarkdownTable}
            onOpenChange={setTableDialogOpen}
            open={tableDialogOpen}
          />

          {/* Hidden file inputs for image and video uploads */}
          {!readOnly && (
            <>
              <input
                accept="image/*"
                className="hidden"
                onChange={handleFileChange}
                ref={fileInputRef}
                type="file"
              />
              <input
                accept="image/*"
                className="hidden"
                multiple
                onChange={handleMultipleFilesChange}
                ref={multipleFileInputRef}
                type="file"
              />
              <input
                accept="video/*"
                className="hidden"
                onChange={handleVideoFileChange}
                ref={videoInputRef}
                type="file"
              />
            </>
          )}

          {/* Editor Content */}
          <CardContent
            className={`mx-auto flex w-full max-w-4xl flex-1 flex-col p-6 transition-all duration-300 ${
              readOnly ? "py-14 md:py-20" : ""
            }`}
          >
            <div ref={editorContentRef}>
              <div data-editor-content>
                {container.children.map((node, index) => {
                  const isText = isTextNode(node);
                  const textNode = isText ? (node as TextNode) : null;

                  const hasChildren =
                    textNode &&
                    Array.isArray(textNode.children) &&
                    textNode.children.length > 0;
                  const nodeKey = hasChildren
                    ? `${node.id}-children-${textNode?.children?.length}`
                    : `${node.id}-content`;

                  const isFirstBlock = index === 0;

                  return (
                    <React.Fragment key={nodeKey}>
                      {/* Add block button before first block */}
                      {!readOnly && isFirstBlock && (
                        <AddBlockButton
                          onAdd={() => handleAddBlock(node.id, "before")}
                          position="before"
                        />
                      )}

                      <div
                        className={`relative transition-all ${
                          dragOverNodeId === node.id &&
                          dropPosition === "before" &&
                          draggingNodeId !== node.id
                            ? "before:bg-primary/30 before:absolute before:inset-x-0 before:-top-1 before:z-10 before:h-1 before:rounded-full"
                            : ""
                        } ${
                          dragOverNodeId === node.id &&
                          dropPosition === "after" &&
                          draggingNodeId !== node.id
                            ? "after:bg-primary/30 after:absolute after:inset-x-0 after:-bottom-1 after:z-10 after:h-1 after:rounded-full"
                            : ""
                        } ${
                          dragOverNodeId === node.id &&
                          dropPosition === "left" &&
                          draggingNodeId !== node.id
                            ? "before:absolute before:inset-y-0 before:-left-1 before:z-10 before:w-1 before:rounded-full before:bg-blue-500/50"
                            : ""
                        } ${
                          dragOverNodeId === node.id &&
                          dropPosition === "right" &&
                          draggingNodeId !== node.id
                            ? "after:absolute after:inset-y-0 after:-right-1 after:z-10 after:w-1 after:rounded-full after:bg-blue-500/50"
                            : ""
                        } `}
                        onDragEnter={(e) => handleDragEnter(e, node.id)}
                        onDragLeave={handleDragLeave}
                        onDragOver={(e) => handleDragOver(e, node.id)}
                        onDrop={(e) => handleDrop(e, node.id)}
                      >
                        <Block
                          dragOverFlexId={dragOverFlexId}
                          flexDropPosition={flexDropPosition}
                          isActive={state.activeNodeId === node.id}
                          key={`${node.id}-${node.type}`}
                          node={node}
                          nodeRef={(el) => {
                            if (el) {
                              const elementNodeId =
                                el.getAttribute("data-node-id");
                              if (elementNodeId) {
                                nodeRefs.current.set(elementNodeId, el);
                              }

                              if (textNode && elementNodeId === node.id) {
                                const isCurrentlyFocused =
                                  document.activeElement === el;
                                const selection = window.getSelection();

                                const hasActiveSelection =
                                  selection &&
                                  selection.rangeCount > 0 &&
                                  !selection.isCollapsed;

                                let selectionInThisElement = false;
                                if (
                                  hasActiveSelection &&
                                  selection.rangeCount > 0
                                ) {
                                  const range = selection.getRangeAt(0);
                                  selectionInThisElement = el.contains(
                                    range.commonAncestorContainer,
                                  );
                                }

                                if (
                                  !isCurrentlyFocused &&
                                  !hasChildren &&
                                  !hasActiveSelection &&
                                  !selectionInThisElement
                                ) {
                                  const displayContent = textNode.content || "";
                                  const currentContent = el.textContent || "";

                                  if (currentContent !== displayContent) {
                                    el.textContent = displayContent;
                                  }
                                }
                              }
                            } else {
                              nodeRefs.current.delete(node.id);
                            }
                          }}
                          onBlockDragStart={handleBlockDragStart}
                          onChangeBlockType={handleChangeBlockType}
                          onClick={() => handleNodeClick(node.id)}
                          onClickWithModifier={handleClickWithModifier}
                          onCreateList={handleCreateListFromCommand}
                          onCreateNested={handleCreateNested}
                          onDelete={(nodeId?: string) =>
                            handleDeleteNode(nodeId || node.id)
                          }
                          onFlexContainerDragLeave={
                            handleFlexContainerDragLeave
                          }
                          onFlexContainerDragOver={handleFlexContainerDragOver}
                          onFlexContainerDrop={handleFlexContainerDrop}
                          onImageDragStart={handleImageDragStart}
                          onInput={(element) =>
                            handleContentChange(node.id, element)
                          }
                          onInsertImage={handleInsertImageFromCommand}
                          onKeyDown={(e) => handleKeyDown(e, node.id)}
                          onToggleImageSelection={handleToggleImageSelection}
                          onUploadImage={onUploadImage}
                          readOnly={readOnly}
                          selectedImageIds={selectedImageIds}
                        />
                      </div>

                      {/* Add block button after each block */}
                      {!readOnly && (
                        <AddBlockButton
                          onAdd={() => handleAddBlock(node.id, "after")}
                          position="after"
                        />
                      )}
                    </React.Fragment>
                  );
                })}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Custom Class Popover - Floats on text selection */}
      <div className={`${readOnly ? "opacity-0" : ""}`}>
        <CustomClassPopover />
      </div>

      {/* Link Popover - Floats on text selection */}
      <div className={`${readOnly ? "opacity-0" : ""}`}>
        <LinkPopover />
      </div>

      {/* Group Images Button - Floats when multiple images selected */}
      {!readOnly && (
        <GroupImagesButton
          inSameFlex={flexInfo.inSameFlex}
          onClear={handleClearImageSelection}
          onExtract={flexInfo.inSameFlex ? handleExtractFromFlex : undefined}
          onGroup={handleGroupSelectedImages}
          onReverse={
            flexInfo.inSameFlex ? handleReverseImagesInFlex : undefined
          }
          selectedCount={selectedImageIds.size}
        />
      )}
    </div>
  );
}
