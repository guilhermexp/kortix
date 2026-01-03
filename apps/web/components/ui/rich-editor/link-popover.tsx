"use client"

import { AnimatePresence, motion } from "framer-motion"
import { Link as LinkIcon, Trash2 } from "lucide-react"
import { useEffect, useRef, useState } from "react"

import { Button } from "../button"
import { Input } from "../input"
import { Label } from "../label"
import { Popover, PopoverContent, PopoverTrigger } from "../popover"
import { useToast } from "./hooks/use-toast"
import { EditorActions, useEditor } from "./index"

export function LinkPopover() {
	const [state, dispatch] = useEditor()
	const { toast } = useToast()
	const [hrefInput, setHrefInput] = useState("")
	const [isOpen, setIsOpen] = useState(false)
	const [position, setPosition] = useState<{
		top: number
		left: number
	} | null>(null)

	// Store the selection in a ref so it persists when focus changes
	const savedSelectionRef = useRef<{
		nodeId: string
		start: number
		end: number
		text: string
		href?: string | null
		formats: {
			bold: boolean
			italic: boolean
			underline: boolean
		}
		elementType?:
			| "p"
			| "h1"
			| "h2"
			| "h3"
			| "h4"
			| "h5"
			| "h6"
			| "code"
			| "blockquote"
			| null
		className?: string | null
	} | null>(null)

	// Track selection and position the floating icon
	useEffect(() => {
		if (state.currentSelection && state.currentSelection.text.length > 0) {
			// Save the selection to ref so it persists when focus changes
			savedSelectionRef.current = {
				nodeId: state.currentSelection.nodeId,
				start: state.currentSelection.start,
				end: state.currentSelection.end,
				text: state.currentSelection.text,
				href: state.currentSelection.href,
				formats: state.currentSelection.formats,
				elementType: state.currentSelection.elementType,
				className: state.currentSelection.className,
			}

			// Pre-fill the href input if selection has an existing link
			if (state.currentSelection.href && !isOpen) {
				setHrefInput(state.currentSelection.href)
			}

			const selection = window.getSelection()
			if (selection && selection.rangeCount > 0) {
				const range = selection.getRangeAt(0)
				const rect = range.getBoundingClientRect()

				// Find the editor container (the parent with relative positioning)
				const editorContainer = document
					.querySelector("[data-editor-content]")
					?.closest(".relative")
				const containerRect = editorContainer?.getBoundingClientRect()

				if (containerRect) {
					// Calculate position relative to the editor container
					setPosition({
						top: rect.top - containerRect.top - 45, // 45px above the selection, relative to container
						left: rect.left - containerRect.left + rect.width / 2 + 16, // Offset to the right, relative to container
					})
				} else {
					// Fallback to old behavior if container not found
					setPosition({
						top: rect.top + window.scrollY - 45,
						left: rect.left + window.scrollX + rect.width / 2 + 16,
					})
				}
			}
		} else {
			// Only clear position if we don't have a saved selection and popover is closed
			if (!isOpen) {
				setPosition(null)
				savedSelectionRef.current = null
			}
		}
	}, [state.currentSelection, isOpen])

	// Handle link application
	const handleApplyLink = () => {
		// Use saved selection from ref instead of state
		if (!savedSelectionRef.current || !hrefInput.trim()) return

		// Temporarily restore the selection in state for the action
		dispatch(EditorActions.setCurrentSelection(savedSelectionRef.current))

		// Apply the link
		setTimeout(() => {
			dispatch(EditorActions.applyLink(hrefInput.trim()))

			toast({
				title: "Link Applied",
				description: `Linked to: ${hrefInput}`,
			})

			setHrefInput("")
			setIsOpen(false)
			setPosition(null)
			savedSelectionRef.current = null
		}, 0)
	}

	// Handle link removal
	const handleRemoveLink = () => {
		// Use saved selection from ref instead of state
		if (!savedSelectionRef.current) return

		// Temporarily restore the selection in state for the action
		dispatch(EditorActions.setCurrentSelection(savedSelectionRef.current))

		// Remove the link
		setTimeout(() => {
			dispatch(EditorActions.removeLink())

			toast({
				title: "Link Removed",
				description: "Link has been removed from selection",
			})

			setHrefInput("")
			setIsOpen(false)
			setPosition(null)
			savedSelectionRef.current = null
		}, 0)
	}

	const hasExistingLink = savedSelectionRef.current?.href

	return (
		<AnimatePresence mode="wait">
			{position && (
				<motion.div
					animate={{ opacity: 1 }}
					className={`${
						position ? "opacity-100" : "!opacity-0"
					} pointer-events-auto absolute z-50 transition-opacity duration-300`}
					exit={{ opacity: 0 }}
					initial={{ opacity: 0 }}
					key={position.top + position.left}
					style={{
						top: `${position?.top || 0}px`,
						left: `${position?.left || 0}px`,
					}}
				>
					<Popover onOpenChange={setIsOpen} open={isOpen}>
						<PopoverTrigger asChild>
							<button
								className={`bg-background flex h-8 w-8 items-center justify-center rounded-full border-2 shadow-lg transition-all hover:scale-110 ${
									hasExistingLink
										? "border-blue-500 text-blue-500"
										: "border-border hover:border-primary"
								}`}
								onClick={(e) => {
									// Prevent default to keep the selection
									e.preventDefault()
									e.stopPropagation()
									setIsOpen(true)
								}}
								onMouseDown={(e) => {
									// Prevent default to keep the selection
									e.preventDefault()
									e.stopPropagation()
								}}
							>
								<LinkIcon className="size-4" />
							</button>
						</PopoverTrigger>
						<PopoverContent
							align="start"
							className="w-80"
							onOpenAutoFocus={(e) => {
								// Prevent the popover from stealing focus and losing selection
								e.preventDefault()
							}}
						>
							<div className="space-y-3">
								<div>
									<h4 className="mb-1 text-sm font-medium">
										{hasExistingLink ? "Edit Link" : "Add Link"}
									</h4>
									<p className="text-muted-foreground text-xs">
										Selected text: "{savedSelectionRef.current?.text}"
									</p>
								</div>
								<div className="space-y-2">
									<Label className="text-xs" htmlFor="href-input">
										Link URL
									</Label>
									<Input
										className="flex-1"
										id="href-input"
										onChange={(e) => setHrefInput(e.target.value)}
										onClick={(e) => e.stopPropagation()}
										onKeyDown={(e) => {
											if (e.key === "Enter") {
												handleApplyLink()
											}
										}}
										onMouseDown={(e) => e.stopPropagation()}
										placeholder="https://example.com"
										value={hrefInput}
									/>
								</div>
								<div className="flex gap-2">
									<Button
										className="flex-1"
										disabled={!hrefInput.trim()}
										onClick={handleApplyLink}
										size="sm"
									>
										<LinkIcon className="mr-1.5 size-3.5" />
										{hasExistingLink ? "Update" : "Add Link"}
									</Button>
									{hasExistingLink && (
										<Button
											onClick={handleRemoveLink}
											size="sm"
											variant="destructive"
										>
											<Trash2 className="size-3.5" />
										</Button>
									)}
								</div>
							</div>
						</PopoverContent>
					</Popover>
				</motion.div>
			)}
		</AnimatePresence>
	)
}
