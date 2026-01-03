"use client"

import { Loader2, Square } from "lucide-react"

interface AIGeneratingProps {
	actionName: string
	onStop: () => void
	hasContent: boolean
}

export function AIGenerating({
	actionName,
	onStop,
	hasContent,
}: AIGeneratingProps) {
	return (
		<div className="ai-generating">
			<div className="ai-generating-content">
				<div className="ai-generating-indicator">
					<Loader2 className="h-4 w-4 animate-spin text-blue-500" />
					<span className="ai-generating-text">
						{hasContent ? "AI is writing..." : `${actionName}...`}
					</span>
				</div>
				<button
					className="ai-generating-stop"
					onClick={onStop}
					title="Stop generating"
					type="button"
				>
					<Square className="h-3 w-3" />
					<span>Stop</span>
				</button>
			</div>
		</div>
	)
}
