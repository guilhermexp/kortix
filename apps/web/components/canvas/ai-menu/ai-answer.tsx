"use client"

import { useCallback, useRef, useEffect } from "react"
import {
	Copy,
	ArrowDownToLine,
	Replace,
	RefreshCw,
	Trash2,
	MessageSquare,
} from "lucide-react"
import ReactMarkdown from "react-markdown"

interface AIAnswerProps {
	content: string
	isStreaming: boolean
	onReplace?: () => void
	onInsertBelow?: () => void
	onRegenerate?: () => void
	onDiscard?: () => void
	onContinueChat?: () => void
}

export function AIAnswer({
	content,
	isStreaming,
	onReplace,
	onInsertBelow,
	onRegenerate,
	onDiscard,
	onContinueChat,
}: AIAnswerProps) {
	const contentRef = useRef<HTMLDivElement>(null)

	// Auto-scroll to bottom while streaming
	useEffect(() => {
		if (isStreaming && contentRef.current) {
			contentRef.current.scrollTop = contentRef.current.scrollHeight
		}
	}, [content, isStreaming])

	const handleCopy = useCallback(async () => {
		try {
			await navigator.clipboard.writeText(content)
		} catch (err) {
			console.error("Failed to copy:", err)
		}
	}, [content])

	const showActions = !isStreaming && (onReplace || onInsertBelow)

	return (
		<div className="ai-answer">
			<div ref={contentRef} className="ai-answer-content">
				<ReactMarkdown
					components={{
						p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
						code: ({ children, className }) => {
							const isInline = !className
							return isInline ? (
								<code className="bg-zinc-800 px-1 py-0.5 rounded text-sm">{children}</code>
							) : (
								<code className="block bg-zinc-800 p-2 rounded text-sm overflow-x-auto">
									{children}
								</code>
							)
						},
						pre: ({ children }) => (
							<pre className="bg-zinc-800 p-2 rounded my-2 overflow-x-auto">{children}</pre>
						),
						ul: ({ children }) => <ul className="list-disc pl-4 mb-2">{children}</ul>,
						ol: ({ children }) => <ol className="list-decimal pl-4 mb-2">{children}</ol>,
						li: ({ children }) => <li className="mb-1">{children}</li>,
						h1: ({ children }) => <h1 className="text-lg font-bold mb-2">{children}</h1>,
						h2: ({ children }) => <h2 className="text-base font-bold mb-2">{children}</h2>,
						h3: ({ children }) => <h3 className="text-sm font-bold mb-1">{children}</h3>,
					}}
				>
					{content}
				</ReactMarkdown>
				{isStreaming && <span className="ai-answer-cursor">|</span>}
			</div>

			{showActions && (
				<>
					{/* Response actions */}
					<div className="ai-answer-actions">
						<div className="ai-answer-actions-group">
							<span className="ai-answer-actions-label">Response</span>
							<div className="ai-answer-actions-buttons">
								{onInsertBelow && (
									<button
										type="button"
										onClick={onInsertBelow}
										className="ai-answer-action-btn"
										title="Insert below"
									>
										<ArrowDownToLine className="h-4 w-4" />
										<span>Insert below</span>
									</button>
								)}
								{onReplace && (
									<button
										type="button"
										onClick={onReplace}
										className="ai-answer-action-btn"
										title="Replace selection"
									>
										<Replace className="h-4 w-4" />
										<span>Replace selection</span>
									</button>
								)}
							</div>
						</div>
					</div>

					{/* Common actions */}
					<div className="ai-answer-common-actions">
						<button
							type="button"
							onClick={handleCopy}
							className="ai-answer-action-btn"
							title="Copy"
						>
							<Copy className="h-4 w-4" />
						</button>
						{onContinueChat && (
							<button
								type="button"
								onClick={onContinueChat}
								className="ai-answer-action-btn"
								title="Continue in chat"
							>
								<MessageSquare className="h-4 w-4" />
								<span>Continue in chat</span>
							</button>
						)}
						{onRegenerate && (
							<button
								type="button"
								onClick={onRegenerate}
								className="ai-answer-action-btn"
								title="Regenerate"
							>
								<RefreshCw className="h-4 w-4" />
								<span>Regenerate</span>
							</button>
						)}
						{onDiscard && (
							<button
								type="button"
								onClick={onDiscard}
								className="ai-answer-action-btn discard"
								title="Discard"
							>
								<Trash2 className="h-4 w-4" />
								<span>Discard</span>
							</button>
						)}
					</div>
				</>
			)}
		</div>
	)
}
