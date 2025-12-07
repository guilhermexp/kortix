"use client"

import { useCallback, useState } from "react"
import {
	Pencil,
	Check,
	MessageSquare,
	Languages,
	Waves,
	Sparkles,
	AlignLeft,
	AlignJustify,
	PenLine,
	FileText,
	Twitter,
	BookOpen,
	Lightbulb,
	ChevronRight,
	CornerDownLeft,
	Code,
	AlertCircle,
} from "lucide-react"
import type { AIAction, AIActionGroup } from "./types"
import { TRANSLATE_LANGUAGES, TEXT_TONES } from "./types"
import { AISubMenu } from "./ai-sub-menu"

interface AIActionListProps {
	onActionSelect: (action: AIAction, options?: { lang?: string; tone?: string }) => void
	selectedText: string
}

// Action groups matching AFFiNE structure
const createActionGroups = (hasCode: boolean): AIActionGroup[] => {
	const groups: AIActionGroup[] = [
		{
			name: "REVIEW TEXT",
			items: [
				{ id: "fixSpelling", name: "Fix spelling", icon: <Pencil className="h-5 w-5" /> },
				{ id: "fixGrammar", name: "Fix grammar", icon: <Pencil className="h-5 w-5" /> },
				{ id: "explain", name: "Explain selection", icon: <MessageSquare className="h-5 w-5" /> },
			],
		},
		{
			name: "EDIT TEXT",
			items: [
				{ id: "translate", name: "Translate to", icon: <Languages className="h-5 w-5" /> },
				{ id: "changeTone", name: "Change tone to", icon: <Waves className="h-5 w-5" /> },
				{ id: "improveWriting", name: "Improve writing", icon: <Sparkles className="h-5 w-5" /> },
				{ id: "makeLonger", name: "Make it longer", icon: <AlignJustify className="h-5 w-5" /> },
				{ id: "makeShorter", name: "Make it shorter", icon: <AlignLeft className="h-5 w-5" /> },
				{ id: "continueWriting", name: "Continue writing", icon: <PenLine className="h-5 w-5" /> },
			],
		},
		{
			name: "GENERATE FROM TEXT",
			items: [
				{ id: "summarize", name: "Summarize", icon: <FileText className="h-5 w-5" /> },
				{ id: "generateHeadings", name: "Generate headings", icon: <FileText className="h-5 w-5" />, beta: true },
				{ id: "generateOutline", name: "Generate outline", icon: <FileText className="h-5 w-5" /> },
				{ id: "brainstormMindmap", name: "Brainstorm ideas with mind map", icon: <Lightbulb className="h-5 w-5" /> },
				{ id: "findActions", name: "Find actions", icon: <Check className="h-5 w-5" />, beta: true },
			],
		},
		{
			name: "DRAFT FROM TEXT",
			items: [
				{ id: "writeArticle", name: "Write an article about this", icon: <BookOpen className="h-5 w-5" /> },
				{ id: "writeTweet", name: "Write a tweet about this", icon: <Twitter className="h-5 w-5" /> },
				{ id: "writePoem", name: "Write a poem about this", icon: <PenLine className="h-5 w-5" /> },
				{ id: "writeBlogPost", name: "Write a blog post about this", icon: <BookOpen className="h-5 w-5" /> },
				{ id: "brainstormIdeas", name: "Brainstorm ideas about this", icon: <Lightbulb className="h-5 w-5" /> },
			],
		},
	]

	// Add code actions if the selected text looks like code
	if (hasCode) {
		groups.splice(1, 0, {
			name: "REVIEW CODE",
			items: [
				{ id: "explainCode", name: "Explain this code", icon: <Code className="h-5 w-5" /> },
				{ id: "checkCodeErrors", name: "Check code error", icon: <AlertCircle className="h-5 w-5" /> },
			],
		})
	}

	return groups
}

// Simple heuristic to detect if text might be code
function looksLikeCode(text: string): boolean {
	const codePatterns = [
		/^(function|const|let|var|class|import|export|if|for|while|return)\s/m,
		/[{};]\s*$/m,
		/=>\s*{/,
		/\(\)\s*{/,
		/<[a-zA-Z][^>]*>/,
		/^\s*(def|class|import|from|if|for|while|return)\s/m,
	]
	return codePatterns.some((pattern) => pattern.test(text))
}

export function AIActionList({ onActionSelect, selectedText }: AIActionListProps) {
	const [hoveredAction, setHoveredAction] = useState<string | null>(null)
	const [subMenuPosition, setSubMenuPosition] = useState<{ x: number; y: number } | null>(null)

	const hasCode = looksLikeCode(selectedText)
	const actionGroups = createActionGroups(hasCode)

	const handleActionClick = useCallback(
		(action: AIAction) => {
			// Actions with submenus don't trigger directly
			if (action.id === "translate" || action.id === "changeTone") {
				return
			}
			onActionSelect(action)
		},
		[onActionSelect],
	)

	const handleMouseEnter = useCallback(
		(action: AIAction, event: React.MouseEvent<HTMLDivElement>) => {
			if (action.id === "translate" || action.id === "changeTone") {
				const rect = event.currentTarget.getBoundingClientRect()
				setHoveredAction(action.id)
				setSubMenuPosition({ x: rect.right + 4, y: rect.top })
			} else {
				setHoveredAction(null)
				setSubMenuPosition(null)
			}
		},
		[],
	)

	const handleMouseLeave = useCallback(() => {
		// Delay to allow moving to submenu
		setTimeout(() => {
			setHoveredAction(null)
			setSubMenuPosition(null)
		}, 100)
	}, [])

	const handleSubMenuSelect = useCallback(
		(value: string) => {
			if (hoveredAction === "translate") {
				onActionSelect(
					{ id: "translate", name: "Translate to", icon: null },
					{ lang: value },
				)
			} else if (hoveredAction === "changeTone") {
				onActionSelect(
					{ id: "changeTone", name: "Change tone to", icon: null },
					{ tone: value },
				)
			}
			setHoveredAction(null)
			setSubMenuPosition(null)
		},
		[hoveredAction, onActionSelect],
	)

	return (
		<div className="ai-action-list">
			{actionGroups.map((group) => (
				<div key={group.name} className="ai-action-group">
					<div className="ai-action-group-name">{group.name}</div>
					{group.items.map((action) => {
						const hasSubMenu = action.id === "translate" || action.id === "changeTone"

						return (
							<div
								key={action.id}
								className="ai-action-item"
								onClick={() => handleActionClick(action)}
								onMouseEnter={(e) => handleMouseEnter(action, e)}
								onMouseLeave={handleMouseLeave}
							>
								<span className="ai-action-icon">{action.icon}</span>
								<span className="ai-action-name">
									{action.name}
									{action.beta && <span className="ai-action-beta">(Beta)</span>}
								</span>
								{hasSubMenu ? (
									<ChevronRight className="ai-action-arrow h-4 w-4" />
								) : (
									<CornerDownLeft className="ai-action-enter h-4 w-4" />
								)}
							</div>
						)
					})}
				</div>
			))}

			{/* Submenus */}
			{hoveredAction === "translate" && subMenuPosition && (
				<AISubMenu
					items={[...TRANSLATE_LANGUAGES]}
					position={subMenuPosition}
					onSelect={handleSubMenuSelect}
					onMouseEnter={() => setHoveredAction("translate")}
					onMouseLeave={() => {
						setHoveredAction(null)
						setSubMenuPosition(null)
					}}
				/>
			)}

			{hoveredAction === "changeTone" && subMenuPosition && (
				<AISubMenu
					items={[...TEXT_TONES]}
					position={subMenuPosition}
					onSelect={handleSubMenuSelect}
					onMouseEnter={() => setHoveredAction("changeTone")}
					onMouseLeave={() => {
						setHoveredAction(null)
						setSubMenuPosition(null)
					}}
				/>
			)}
		</div>
	)
}
