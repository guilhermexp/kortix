"use client"

import { useCallback, useRef, useState, useEffect } from "react"
import { Sparkles, Send } from "lucide-react"

interface AIInputBarProps {
	onSubmit: (text: string) => void
	placeholder?: string
}

export function AIInputBar({
	onSubmit,
	placeholder = "What are your thoughts?"
}: AIInputBarProps) {
	const [value, setValue] = useState("")
	const textareaRef = useRef<HTMLTextAreaElement>(null)

	// Auto-focus on mount
	useEffect(() => {
		setTimeout(() => {
			textareaRef.current?.focus()
		}, 100)
	}, [])

	// Auto-resize textarea
	const handleInput = useCallback(() => {
		const textarea = textareaRef.current
		if (textarea) {
			textarea.style.height = "auto"
			textarea.style.height = `${textarea.scrollHeight}px`
		}
	}, [])

	const handleChange = useCallback(
		(e: React.ChangeEvent<HTMLTextAreaElement>) => {
			setValue(e.target.value)
			handleInput()
		},
		[handleInput],
	)

	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent<HTMLTextAreaElement>) => {
			if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
				e.preventDefault()
				const trimmed = value.trim()
				if (trimmed) {
					onSubmit(trimmed)
				}
			}
		},
		[value, onSubmit],
	)

	const handleSend = useCallback(() => {
		const trimmed = value.trim()
		if (trimmed) {
			onSubmit(trimmed)
		}
	}, [value, onSubmit])

	const hasContent = value.trim().length > 0

	return (
		<div className="ai-input-bar">
			<div className="ai-input-bar-icon">
				<Sparkles className="h-5 w-5 text-blue-500" />
			</div>
			<div className="ai-input-bar-container">
				<textarea
					ref={textareaRef}
					value={value}
					onChange={handleChange}
					onKeyDown={handleKeyDown}
					placeholder={placeholder}
					rows={1}
					className="ai-input-bar-textarea"
				/>
				<button
					type="button"
					onClick={handleSend}
					disabled={!hasContent}
					className={`ai-input-bar-send ${hasContent ? "active" : ""}`}
					title="Send to AI"
				>
					<Send className="h-5 w-5" />
				</button>
			</div>
		</div>
	)
}
