"use client"

import { GripVertical } from "lucide-react"
import type React from "react"
import { useCallback, useEffect, useRef, useState } from "react"

import { BlockContextMenu } from "./block-context-menu"
import { CommandMenu } from "./command-menu"
import { useEditor } from "./context/editor-context"
import { FlexContainer } from "./flex-container"
// Import all block handlers
import {
	buildHTML,
	createHandleBackgroundColorChange,
	createHandleBlockDragEnd,
	createHandleBlockDragStart,
	createHandleClick,
	createHandleCommandSelect,
	createHandleCompositionEnd,
	createHandleCompositionStart,
	createHandleInput,
	createHandleKeyDown,
	getTypeClassName,
	restoreSelection,
	saveSelection,
} from "./handlers/block"
import { ImageBlock } from "./image-block"
import {
	type ContainerNode,
	type EditorNode,
	getNodeTextContent,
	isContainerNode,
	type TextNode,
} from "./index"
import { TableBuilder } from "./table-builder"
import { VideoBlock } from "./video-block"

interface BlockProps {
	node: EditorNode
	isActive: boolean
	nodeRef: (el: HTMLElement | null) => void
	onInput: (element: HTMLElement) => void
	onKeyDown: (e: React.KeyboardEvent<HTMLElement>) => void
	onClick: () => void
	onDelete?: (nodeId?: string) => void
	onCreateNested?: (nodeId: string) => void
	depth?: number
	readOnly?: boolean
	onImageDragStart?: (nodeId: string) => void
	onChangeBlockType?: (nodeId: string, newType: string) => void
	onInsertImage?: (nodeId: string) => void
	onCreateList?: (nodeId: string, listType: string) => void
	onUploadImage?: (file: File) => Promise<string>
	onBlockDragStart?: (nodeId: string) => void
	selectedImageIds?: Set<string>
	onToggleImageSelection?: (nodeId: string) => void
	onClickWithModifier?: (e: React.MouseEvent, nodeId: string) => void
	onFlexContainerDragOver?: (
		e: React.DragEvent,
		flexId: string,
		position: "left" | "right" | null,
	) => void
	onFlexContainerDragLeave?: (e: React.DragEvent) => void
	onFlexContainerDrop?: (
		e: React.DragEvent,
		flexId: string,
		position: "left" | "right" | null,
	) => void
	dragOverFlexId?: string | null
	flexDropPosition?: "left" | "right" | null
}

export function Block({
	node,
	isActive,
	nodeRef,
	onInput,
	onKeyDown,
	onClick,
	onDelete,
	onCreateNested,
	depth = 0,
	readOnly = false,
	onImageDragStart,
	onChangeBlockType,
	onInsertImage,
	onCreateList,
	onUploadImage,
	onBlockDragStart,
	selectedImageIds,
	onToggleImageSelection,
	onClickWithModifier,
	onFlexContainerDragOver,
	onFlexContainerDragLeave,
	onFlexContainerDrop,
	dragOverFlexId,
	flexDropPosition,
}: BlockProps) {
	const localRef = useRef<HTMLElement | null>(null)
	const isComposingRef = useRef(false)
	const shouldPreserveSelectionRef = useRef(false)
	const [isHovering, setIsHovering] = useState(false)

	// Get editor context for direct state manipulation (needed for table updates)
	const [state, dispatch] = useEditor()

	// Command menu state
	const [showCommandMenu, setShowCommandMenu] = useState(false)
	const [commandMenuAnchor, setCommandMenuAnchor] =
		useState<HTMLElement | null>(null)

	// Handle container nodes (recursive rendering)
	if (isContainerNode(node)) {
		const containerNode = node as ContainerNode

		// Get first child
		const firstChild = containerNode.children[0]

		// Check if this is a table wrapper container
		const isTableWrapper = firstChild?.type === "table"

		// If this container wraps a table, render the TableBuilder
		if (isTableWrapper) {
			return (
				<TableBuilder
					key={node.id}
					node={containerNode}
					onBlockDragStart={onBlockDragStart}
					onUpdate={(id, updates) => {
						if (dispatch) {
							dispatch({
								type: "UPDATE_NODE",
								payload: { id, updates },
							})
						}
					}}
					readOnly={readOnly}
				/>
			)
		}

		// Check if this is a flex container for images
		const layoutType = containerNode.attributes?.layoutType as
			| string
			| undefined
		const isFlexContainer = layoutType === "flex"
		const _gap = containerNode.attributes?.gap as string | undefined
		const _flexWrap = containerNode.attributes?.flexWrap as string | undefined

		// Determine if this container holds list items
		const listTypeFromAttribute = containerNode.attributes?.listType as
			| string
			| undefined
		const listTypeFromChild =
			firstChild &&
			(firstChild.type === "ul" ||
				firstChild.type === "ol" ||
				firstChild.type === "li")
				? firstChild.type === "li"
					? "ul"
					: firstChild.type
				: null

		const listType = listTypeFromAttribute || listTypeFromChild
		const isListContainer = !!listType

		// Use ul/ol for list containers, div for regular nested containers
		const ContainerElement =
			listType === "ul" ? "ul" : listType === "ol" ? "ol" : "div"

		const containerClasses = isFlexContainer
			? ""
			: isListContainer
				? "list-none pl-0 ml-6"
				: `border-l-2 border-border/50 pl-2 ml-6 transition-all ${
						isActive ? "border-primary" : "hover:border-border"
					}`

		// Render flex container with FlexContainer component
		if (isFlexContainer) {
			return (
				<FlexContainer
					dragOverPosition={
						dragOverFlexId === node.id ? flexDropPosition : null
					}
					key={node.id}
					node={containerNode}
					onDragLeave={onFlexContainerDragLeave}
					onDragOver={(e, position) => {
						if (onFlexContainerDragOver) {
							onFlexContainerDragOver(e, node.id, position)
						}
					}}
					onDrop={(e, position) => {
						if (onFlexContainerDrop) {
							onFlexContainerDrop(e, node.id, position)
						}
					}}
				>
					{containerNode.children.map((childNode) => {
						const isChildMedia =
							childNode &&
							"type" in childNode &&
							(childNode.type === "img" || childNode.type === "video")

						const blockContent = (
							<Block
								depth={depth + 1}
								dragOverFlexId={dragOverFlexId}
								flexDropPosition={flexDropPosition}
								isActive={isActive}
								key={childNode.id}
								node={childNode}
								nodeRef={nodeRef}
								onChangeBlockType={onChangeBlockType}
								onClick={onClick}
								onClickWithModifier={onClickWithModifier}
								onCreateList={onCreateList}
								onCreateNested={onCreateNested}
								onDelete={
									isChildMedia && onDelete
										? () => onDelete(childNode.id)
										: undefined
								}
								onFlexContainerDragLeave={onFlexContainerDragLeave}
								onFlexContainerDragOver={onFlexContainerDragOver}
								onFlexContainerDrop={onFlexContainerDrop}
								onImageDragStart={onImageDragStart}
								onInput={onInput}
								onInsertImage={onInsertImage}
								onKeyDown={(e) => {
									onKeyDown(e)
								}}
								onToggleImageSelection={onToggleImageSelection}
								onUploadImage={onUploadImage}
								readOnly={readOnly}
								selectedImageIds={selectedImageIds}
							/>
						)

						// Wrap in flex item div
						return (
							<div
								className="max-w-full min-w-[280px] flex-1"
								key={childNode.id}
							>
								{blockContent}
							</div>
						)
					})}
				</FlexContainer>
			)
		}

		return (
			<ContainerElement
				className={containerClasses}
				data-list-type={listType || undefined}
				data-node-id={node.id}
				data-node-type="container"
				key={node.id}
			>
				{containerNode.children.map((childNode) => {
					const isChildMedia =
						childNode &&
						"type" in childNode &&
						(childNode.type === "img" || childNode.type === "video")

					const blockContent = (
						<Block
							depth={depth + 1}
							dragOverFlexId={dragOverFlexId}
							flexDropPosition={flexDropPosition}
							isActive={isActive}
							key={childNode.id}
							node={childNode}
							nodeRef={nodeRef}
							onChangeBlockType={onChangeBlockType}
							onClick={onClick}
							onClickWithModifier={onClickWithModifier}
							onCreateList={onCreateList}
							onCreateNested={onCreateNested}
							onDelete={
								isChildMedia && onDelete
									? () => onDelete(childNode.id)
									: undefined
							}
							onFlexContainerDragLeave={onFlexContainerDragLeave}
							onFlexContainerDragOver={onFlexContainerDragOver}
							onFlexContainerDrop={onFlexContainerDrop}
							onImageDragStart={onImageDragStart}
							onInput={onInput}
							onInsertImage={onInsertImage}
							onKeyDown={(e) => {
								onKeyDown(e)
							}}
							onToggleImageSelection={onToggleImageSelection}
							onUploadImage={onUploadImage}
							readOnly={readOnly}
							selectedImageIds={selectedImageIds}
						/>
					)

					// If it's a flex container, wrap in a flex item div
					if (isFlexContainer) {
						return (
							<div
								className="max-w-full min-w-[280px] flex-1"
								key={childNode.id}
							>
								{blockContent}
							</div>
						)
					}

					return blockContent
				})}
			</ContainerElement>
		)
	}

	// Cast to TextNode for remaining cases
	const textNode = node as TextNode

	// BR elements render as empty space
	if (textNode.type === "br") {
		return (
			<div
				className="h-6"
				data-node-id={textNode.id}
				key={textNode.id}
				onClick={onClick}
			/>
		)
	}

	// Image nodes render as ImageBlock
	if (textNode.type === "img") {
		return (
			<ImageBlock
				isActive={isActive}
				isSelected={selectedImageIds?.has(textNode.id)}
				node={textNode}
				onClick={onClick}
				onClickWithModifier={onClickWithModifier}
				onDelete={onDelete}
				onDragStart={onImageDragStart}
				onToggleSelection={onToggleImageSelection}
			/>
		)
	}

	// Video nodes render as VideoBlock
	if (textNode.type === "video") {
		return (
			<VideoBlock
				isActive={isActive}
				isSelected={selectedImageIds?.has(textNode.id)}
				node={textNode}
				onClick={onClick}
				onClickWithModifier={onClickWithModifier}
				onDelete={onDelete}
				onDragStart={onImageDragStart}
				onToggleSelection={onToggleImageSelection}
			/>
		)
	}

	// Get current container from state (already have dispatch from top of component)
	const currentContainer = state.history[state.historyIndex]!

	if (!currentContainer) {
		console.error("No current container found in history")
		return null
	}

	// Build HTML callback
	const memoizedBuildHTML = useCallback(() => {
		return buildHTML(textNode, readOnly)
	}, [textNode, readOnly])

	// Save selection callback
	const memoizedSaveSelection = useCallback(() => {
		return saveSelection(localRef)
	}, [])

	// Restore selection callback
	const memoizedRestoreSelection = useCallback(
		(
			savedSelection: { start: number; end: number; collapsed: boolean } | null,
		) => {
			restoreSelection(localRef, savedSelection)
		},
		[],
	)

	// Update content when needed
	useEffect(() => {
		if (!localRef.current) return

		if (isComposingRef.current || shouldPreserveSelectionRef.current) {
			return
		}

		const element = localRef.current
		const newHTML = memoizedBuildHTML()

		if (element.innerHTML !== newHTML) {
			const hadFocus = document.activeElement === element
			const savedSelectionData = hadFocus ? memoizedSaveSelection() : null

			element.innerHTML = newHTML

			if (hadFocus && savedSelectionData) {
				memoizedRestoreSelection(savedSelectionData)
			}
		}
	}, [memoizedBuildHTML, memoizedSaveSelection, memoizedRestoreSelection])

	// Create all handlers
	const handleCompositionStart = useCallback(
		createHandleCompositionStart()(isComposingRef),
		[],
	)

	const handleCompositionEnd = useCallback(
		createHandleCompositionEnd()(isComposingRef),
		[],
	)

	const handleInput = useCallback(
		createHandleInput({
			textNode,
			readOnly,
			onInput,
			onChangeBlockType,
			showCommandMenu,
			setShowCommandMenu,
			setCommandMenuAnchor,
			shouldPreserveSelectionRef,
		}),
		[],
	)

	const handleKeyDown = useCallback(
		createHandleKeyDown({
			textNode,
			readOnly,
			onInput,
			onKeyDown,
			onClick,
			onCreateNested,
			onChangeBlockType,
			onInsertImage,
			onCreateList,
			currentContainer,
			dispatch,
			localRef,
			isComposingRef,
			shouldPreserveSelectionRef,
			showCommandMenu,
			setShowCommandMenu,
			setCommandMenuAnchor,
		}),
		[],
	)

	const handleClick = useCallback(createHandleClick({ readOnly, onClick }), [])

	const handleCommandSelect = useCallback(
		createHandleCommandSelect({
			textNode,
			onChangeBlockType,
			onInsertImage,
			onCreateList,
			localRef,
			setShowCommandMenu,
			setCommandMenuAnchor,
		}),
		[],
	)

	const handleBackgroundColorChange = useCallback(
		createHandleBackgroundColorChange(textNode, dispatch),
		[],
	)

	const handleBlockDragStartFn = useCallback(
		createHandleBlockDragStart(textNode, onBlockDragStart),
		[],
	)

	const handleBlockDragEndFn = useCallback(createHandleBlockDragEnd(), [])

	// Check if block is empty
	const textContent = getNodeTextContent(textNode)
	const isEmpty = !textContent || textContent.trim() === ""
	const showPlaceholder = isEmpty && isActive && !readOnly && onChangeBlockType

	// Determine which HTML element to render based on type
	const ElementType =
		textNode.type === "li"
			? "li"
			: textNode.type === "h1"
				? "h1"
				: textNode.type === "h2"
					? "h2"
					: textNode.type === "h3"
						? "h3"
						: textNode.type === "h4"
							? "h4"
							: textNode.type === "h5"
								? "h5"
								: textNode.type === "h6"
									? "h6"
									: textNode.type === "p"
										? "p"
										: textNode.type === "blockquote"
											? "blockquote"
											: textNode.type === "code"
												? "pre"
												: "div"

	const isListItem = textNode.type === "li"

	// Get custom class from attributes
	const customClassName = textNode.attributes?.className || ""
	const isHexColor =
		typeof customClassName === "string" && customClassName.startsWith("#")
	const textColor = isHexColor ? customClassName : ""
	const className = isHexColor ? "" : customClassName

	// Get background color from attributes
	const backgroundColor = textNode.attributes?.backgroundColor as
		| string
		| undefined

	// Common props for all elements
	const commonProps = {
		key: textNode.id,
		"data-node-id": textNode.id,
		"data-node-type": textNode.type,
		contentEditable: !readOnly,
		suppressContentEditableWarning: true,
		className: `
      ${isListItem ? "relative" : ""} 
      ${getTypeClassName(textNode.type)}
      ${className}
      ${readOnly ? "" : "outline-none focus:ring-1 focus:ring-border/50"}
      rounded-lg px-3 py-2 mb-2
      transition-all
      ${!readOnly && isActive ? "ring-1 ring-border/50 bg-accent/5" : ""}
      ${!readOnly ? "hover:bg-accent/5" : ""}
      ${readOnly ? "cursor-default" : ""}
    `,
		style: {
			marginLeft: `${depth * 0.5}rem`,
			...(textColor ? { color: textColor as string } : {}),
			...(backgroundColor ? { backgroundColor: backgroundColor } : {}),
		},
		spellCheck: false,
	}

	return (
		<>
			<BlockContextMenu
				currentBackgroundColor={backgroundColor}
				onBackgroundColorChange={handleBackgroundColorChange}
				readOnly={readOnly}
			>
				<div
					className="group relative"
					onMouseEnter={() => !readOnly && setIsHovering(true)}
					onMouseLeave={() => !readOnly && setIsHovering(false)}
					style={{
						paddingLeft: readOnly ? "0" : "28px",
						marginLeft: readOnly ? "0" : "-28px",
					}}
				>
					{/* Drag Handle */}
					{!readOnly && isHovering && onBlockDragStart && (
						<div
							className="absolute top-1/2 left-1 z-10 -translate-y-1/2 cursor-grab opacity-0 transition-opacity duration-200 group-hover:opacity-100 active:cursor-grabbing"
							draggable
							onClick={(e) => e.stopPropagation()}
							onDragEnd={handleBlockDragEndFn}
							onDragStart={handleBlockDragStartFn}
							onMouseDown={(e) => e.stopPropagation()}
						>
							<GripVertical
								className="text-muted-foreground hover:text-foreground h-4 w-4 transition-colors duration-200"
								strokeWidth={1.5}
							/>
						</div>
					)}

					<ElementType
						{...commonProps}
						key={textNode.id}
						onClick={(e) => handleClick(e as any)}
						onCompositionEnd={readOnly ? undefined : handleCompositionEnd}
						onCompositionStart={readOnly ? undefined : handleCompositionStart}
						onInput={readOnly ? undefined : (e) => handleInput(e as any)}
						onKeyDown={readOnly ? undefined : (e) => handleKeyDown(e as any)}
						ref={(el: HTMLElement | null) => {
							localRef.current = el
							nodeRef(el)
						}}
					/>

					{/* Placeholder text */}
					{showPlaceholder && (
						<div
							className="text-muted-foreground/50 pointer-events-none absolute top-2 select-none"
							style={{
								left: readOnly ? "0.75rem" : "calc(28px + 0.75rem)",
								marginLeft: `${depth * 0.5}rem`,
							}}
						>
							Type / for commands...
						</div>
					)}
				</div>
			</BlockContextMenu>

			{/* Command Menu */}
			{!readOnly && (
				<CommandMenu
					anchorElement={commandMenuAnchor}
					isOpen={showCommandMenu}
					nodeId={textNode.id}
					onClose={() => setShowCommandMenu(false)}
					onSelect={handleCommandSelect}
					onUploadImage={onUploadImage}
				/>
			)}
		</>
	)
}
