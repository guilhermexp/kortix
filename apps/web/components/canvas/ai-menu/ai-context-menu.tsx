"use client"

import { AnimatePresence, motion } from "framer-motion"
import { useCallback, useEffect, useRef, useState } from "react"
import { AIActionList } from "./ai-action-list"
import { AIAnswer } from "./ai-answer"
import { AIGenerating } from "./ai-generating"
import { AIInputBar } from "./ai-input-bar"
import type { AIAction, AIMenuState } from "./types"

interface AIContextMenuProps {
	isOpen: boolean
	onClose: () => void
	position: { x: number; y: number }
	selectedText: string
	onApplyResult: (result: string, action: "replace" | "insert") => void
}

export function AIContextMenu({
	isOpen,
	onClose,
	position,
	selectedText,
	onApplyResult,
}: AIContextMenuProps) {
	const menuRef = useRef<HTMLDivElement>(null)
	const [state, setState] = useState<AIMenuState>("input")
	const [currentAction, setCurrentAction] = useState<AIAction | null>(null)
	const [result, setResult] = useState<string>("")
	const [isStreaming, setIsStreaming] = useState(false)
	const abortControllerRef = useRef<AbortController | null>(null)

	// Reset state when menu opens
	useEffect(() => {
		if (isOpen) {
			setState("input")
			setCurrentAction(null)
			setResult("")
			setIsStreaming(false)
		}
	}, [isOpen])

	// Handle click outside
	useEffect(() => {
		const handleClickOutside = (e: MouseEvent) => {
			if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
				if (state === "generating") {
					// Show confirmation before closing while generating
					if (confirm("Stop generating?")) {
						abortControllerRef.current?.abort()
						onClose()
					}
				} else if (state === "finished" && result) {
					// Show confirmation before discarding result
					if (confirm("Discard the AI result?")) {
						onClose()
					}
				} else {
					onClose()
				}
			}
		}

		if (isOpen) {
			document.addEventListener("mousedown", handleClickOutside)
		}
		return () => document.removeEventListener("mousedown", handleClickOutside)
	}, [isOpen, state, result, onClose])

	// Handle escape key
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				if (state === "generating") {
					abortControllerRef.current?.abort()
					setState("finished")
				} else {
					onClose()
				}
			}
		}

		if (isOpen) {
			document.addEventListener("keydown", handleKeyDown)
		}
		return () => document.removeEventListener("keydown", handleKeyDown)
	}, [isOpen, state, onClose])

	const executeAction = useCallback(
		async (
			action: AIAction,
			options?: { lang?: string; tone?: string; customPrompt?: string },
		) => {
			setCurrentAction(action)
			setState("generating")
			setResult("")
			setIsStreaming(true)

			abortControllerRef.current = new AbortController()

			try {
				const response = await fetch("/api/ai-actions/stream", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						action: action.id,
						content: selectedText,
						options,
					}),
					signal: abortControllerRef.current.signal,
				})

				if (!response.ok) {
					throw new Error("Failed to execute action")
				}

				const reader = response.body?.getReader()
				if (!reader) throw new Error("No reader available")

				const decoder = new TextDecoder()
				let buffer = ""

				while (true) {
					const { done, value } = await reader.read()
					if (done) break

					buffer += decoder.decode(value, { stream: true })
					const lines = buffer.split("\n")
					buffer = lines.pop() || ""

					for (const line of lines) {
						if (line.startsWith("data: ")) {
							try {
								const data = JSON.parse(line.slice(6))
								if (data.type === "text") {
									setResult((prev) => prev + data.content)
								} else if (data.type === "done") {
									setIsStreaming(false)
									setState("finished")
								} else if (data.type === "error") {
									throw new Error(data.error)
								}
							} catch {
								// Ignore parse errors
							}
						}
					}
				}

				setIsStreaming(false)
				setState("finished")
			} catch (error) {
				if ((error as Error).name === "AbortError") {
					setIsStreaming(false)
					if (result) {
						setState("finished")
					} else {
						setState("input")
					}
				} else {
					console.error("AI Action error:", error)
					setState("error")
				}
			}
		},
		[selectedText, result],
	)

	const handleActionSelect = useCallback(
		(action: AIAction, options?: { lang?: string; tone?: string }) => {
			executeAction(action, options)
		},
		[executeAction],
	)

	const handleCustomPrompt = useCallback(
		(prompt: string) => {
			executeAction(
				{ id: "chat", name: "Chat", icon: null },
				{ customPrompt: prompt },
			)
		},
		[executeAction],
	)

	const handleRegenerate = useCallback(() => {
		if (currentAction) {
			executeAction(currentAction)
		}
	}, [currentAction, executeAction])

	const handleStopGenerating = useCallback(() => {
		abortControllerRef.current?.abort()
		setIsStreaming(false)
		if (result) {
			setState("finished")
		} else {
			setState("input")
		}
	}, [result])

	const handleReplace = useCallback(() => {
		onApplyResult(result, "replace")
		onClose()
	}, [result, onApplyResult, onClose])

	const handleInsertBelow = useCallback(() => {
		onApplyResult(result, "insert")
		onClose()
	}, [result, onApplyResult, onClose])

	const handleDiscard = useCallback(() => {
		onClose()
	}, [onClose])

	if (!isOpen) return null

	// Calculate position to keep menu in viewport
	const menuStyle: React.CSSProperties = {
		position: "fixed",
		left: position.x,
		top: position.y,
		zIndex: 9999,
	}

	return (
		<AnimatePresence>
			<motion.div
				animate={{ opacity: 1, y: 0, scale: 1 }}
				className="ai-context-menu"
				exit={{ opacity: 0, y: -10, scale: 0.95 }}
				initial={{ opacity: 0, y: -10, scale: 0.95 }}
				ref={menuRef}
				style={menuStyle}
				transition={{ duration: 0.15 }}
			>
				<div className="ai-context-menu-container">
					{state === "input" && (
						<>
							<AIInputBar onSubmit={handleCustomPrompt} />
							<AIActionList
								onActionSelect={handleActionSelect}
								selectedText={selectedText}
							/>
						</>
					)}

					{state === "generating" && (
						<>
							{result && (
								<AIAnswer content={result} isStreaming={isStreaming} />
							)}
							<AIGenerating
								actionName={currentAction?.name || "Processing"}
								hasContent={!!result}
								onStop={handleStopGenerating}
							/>
						</>
					)}

					{state === "finished" && result && (
						<AIAnswer
							content={result}
							isStreaming={false}
							onDiscard={handleDiscard}
							onInsertBelow={handleInsertBelow}
							onRegenerate={handleRegenerate}
							onReplace={handleReplace}
						/>
					)}

					{state === "error" && (
						<div className="ai-error">
							<p>Something went wrong. Please try again.</p>
							<button onClick={() => setState("input")}>Try Again</button>
						</div>
					)}
				</div>
			</motion.div>
		</AnimatePresence>
	)
}
