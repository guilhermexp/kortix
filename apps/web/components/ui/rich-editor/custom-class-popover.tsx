"use client"

import { AnimatePresence, motion } from "framer-motion"
import { Code2, Pencil, Search } from "lucide-react"
import React, { useEffect, useRef, useState } from "react"

import { Button } from "../button"
import { Input } from "../input"
import { Popover, PopoverContent, PopoverTrigger } from "../popover"
import { ScrollArea } from "../scroll-area"
import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
} from "../sheet"
import { Switch } from "../switch"
import {
	getUserFriendlyClasses,
	searchUserFriendlyClasses,
} from "./class-mappings"
import { useEditor } from "./context/editor-context"
import { useIsMobile } from "./hooks/use-mobile"
import { useToast } from "./hooks/use-toast"
import { EditorActions } from "./reducer/actions"
import { tailwindClasses } from "./tailwind-classes"

export function CustomClassPopover() {
	const [state, dispatch] = useEditor()
	const { toast } = useToast()
	const [searchQuery, setSearchQuery] = useState("")
	const [isOpen, setIsOpen] = useState(false)
	const [devMode, setDevMode] = useState(false)
	const [position, setPosition] = useState<{
		top: number
		left: number
	} | null>(null)
	const isMobile = useIsMobile()

	// Store the selection in a ref so it persists when focus changes
	const savedSelectionRef = useRef<{
		nodeId: string
		start: number
		end: number
		text: string
	} | null>(null)

	// Filter classes based on search and dev mode
	const filteredClasses = devMode
		? // Dev Mode: Show Tailwind classes
			searchQuery
			? tailwindClasses
					.map((group) => ({
						...group,
						classes: group.classes.filter((cls) =>
							cls.toLowerCase().includes(searchQuery.toLowerCase()),
						),
					}))
					.filter((group) => group.classes.length > 0)
			: tailwindClasses
		: // User Mode: Show user-friendly names
			searchQuery
			? searchUserFriendlyClasses(searchQuery)
			: getUserFriendlyClasses()

	// Track selection and position the floating icon
	useEffect(() => {
		if (state.currentSelection && state.currentSelection.text.length > 0) {
			// Save the selection to ref so it persists when focus changes
			savedSelectionRef.current = {
				nodeId: state.currentSelection.nodeId,
				start: state.currentSelection.start,
				end: state.currentSelection.end,
				text: state.currentSelection.text,
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
						left: rect.left - containerRect.left + rect.width / 2 - 16, // Centered on selection, relative to container
					})
				} else {
					// Fallback to old behavior if container not found
					setPosition({
						top: rect.top + window.scrollY - 45,
						left: rect.left + window.scrollX + rect.width / 2 - 16,
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
	}, [state.currentSelection, state.selectionKey, isOpen])
	// Close keyboard on mobile
	const closeKeyboard = () => {
		if (isMobile && document.activeElement instanceof HTMLElement) {
			document.activeElement.blur()
		}
	}

	// Handle opening the popover/sheet
	const handleOpenChange = (open: boolean) => {
		if (open && isMobile) {
			closeKeyboard()
			// Small delay to ensure keyboard is closed before opening
			setTimeout(() => setIsOpen(true), 100)
		} else {
			setIsOpen(open)
		}
	}

	// Handle class application
	const handleQuickStyle = (className: string) => {
		// Use saved selection from ref instead of state
		if (!savedSelectionRef.current) return

		// Temporarily restore the selection in state for the action
		dispatch(
			EditorActions.setCurrentSelection({
				...savedSelectionRef.current,
				formats: { bold: false, italic: false, underline: false },
			}),
		)

		// Apply the custom class
		setTimeout(() => {
			dispatch(EditorActions.applyCustomClass(className))

			toast({
				title: "Custom Class Applied",
				description: `Applied class: ${className}`,
			})

			setIsOpen(false)
			setPosition(null)
			savedSelectionRef.current = null
		}, 0)
	}

	// Reusable content component for both Popover and Sheet
	const ClassPickerContent = () => (
		<div className="space-y-3">
			{/* Dev Mode Toggle */}
			<div className="flex items-center justify-between border-b pb-2">
				<div className="flex items-center gap-2">
					<Code2 className="text-muted-foreground h-4 w-4" />
					<span className="text-sm font-medium">Dev Mode</span>
				</div>
				<Switch
					aria-label="Toggle dev mode"
					checked={devMode}
					onCheckedChange={setDevMode}
				/>
			</div>

			<div className="relative">
				<Search className="text-muted-foreground absolute top-2.5 left-2 h-4 w-4" />
				<Input
					autoFocus
					className="pl-8"
					onChange={(e) => setSearchQuery(e.target.value)}
					onClick={(e) => e.stopPropagation()}
					onMouseDown={(e) => e.stopPropagation()}
					placeholder={
						devMode
							? "Search classes... (e.g., 'text', 'bg', 'flex')"
							: "Search styles... (e.g., 'red', 'bold', 'shadow')"
					}
					value={searchQuery}
				/>
			</div>
			<ScrollArea className="h-[500px] pr-4">
				<div className="space-y-4">
					{devMode ? (
						// Dev Mode: Show Tailwind classes
						<>
							{filteredClasses.map((group) => (
								<div key={group.category}>
									<h4 className="text-muted-foreground mb-2 text-xs font-semibold">
										{group.category}
									</h4>
									<div className="flex flex-wrap gap-1.5">
										{(group as any).classes.map((cls: string) => (
											<Button
												className="h-6 px-2 text-xs"
												key={cls}
												onClick={() => handleQuickStyle(cls)}
												size="sm"
												variant="outline"
											>
												{cls}
											</Button>
										))}
									</div>
								</div>
							))}
						</>
					) : (
						// User Mode: Show user-friendly names
						<>
							{filteredClasses.map((group) => (
								<div key={group.category}>
									<h4 className="text-muted-foreground mb-2 text-xs font-semibold">
										{group.category}
									</h4>
									<div className="flex flex-wrap gap-1.5">
										{(group as any).items.map(
											(item: { label: string; value: string }) => (
												<Button
													className="h-6 px-2 text-xs"
													key={item.value}
													onClick={() => handleQuickStyle(item.value)}
													size="sm"
													title={`Applies: ${item.value}`}
													variant="outline"
												>
													{item.label}
												</Button>
											),
										)}
									</div>
								</div>
							))}
						</>
					)}
					{filteredClasses.length === 0 && (
						<div className="text-muted-foreground py-8 text-center text-sm">
							No classes found matching &quot;{searchQuery}&quot;
						</div>
					)}
				</div>
			</ScrollArea>
		</div>
	)

	// Trigger button component
	const TriggerButton = () => (
		<button
			className="bg-background border-border hover:border-primary flex h-8 w-8 items-center justify-center rounded-full border-2 shadow-lg transition-all hover:scale-110"
			onClick={(e) => {
				// Prevent default to keep the selection
				e.preventDefault()
				e.stopPropagation()
				if (isMobile) {
					closeKeyboard()
				}
				setIsOpen(true)
			}}
			onMouseDown={(e) => {
				// Prevent default to keep the selection
				e.preventDefault()
				e.stopPropagation()
			}}
		>
			<Pencil className="size-4" />
		</button>
	)

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
					{isMobile ? (
						// Mobile: Use Sheet (drawer from bottom)
						<Sheet onOpenChange={handleOpenChange} open={isOpen}>
							<SheetTrigger asChild>
								<TriggerButton />
							</SheetTrigger>
							<SheetContent
								className="h-[85vh] rounded-t-xl px-5"
								onOpenAutoFocus={(e) => {
									// Prevent auto-focus to avoid reopening keyboard
									e.preventDefault()
								}}
								side="bottom"
							>
								<SheetHeader>
									<SheetTitle>Custom Classes</SheetTitle>
								</SheetHeader>
								<div className="mt-4 h-[calc(100%-60px)] overflow-y-auto">
									<ClassPickerContent />
								</div>
							</SheetContent>
						</Sheet>
					) : (
						// Desktop: Use Popover
						<Popover onOpenChange={setIsOpen} open={isOpen}>
							<PopoverTrigger asChild>
								<TriggerButton />
							</PopoverTrigger>
							<PopoverContent
								align="start"
								className="max-h-[300px] overflow-y-auto lg:w-[300px]"
								onOpenAutoFocus={(e) => {
									// Prevent the popover from stealing focus and losing selection
									e.preventDefault()
								}}
							>
								<ClassPickerContent />
							</PopoverContent>
						</Popover>
					)}
				</motion.div>
			)}
		</AnimatePresence>
	)
}
