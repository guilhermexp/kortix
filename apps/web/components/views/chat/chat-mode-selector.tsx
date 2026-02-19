"use client"

import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@repo/ui/components/dropdown-menu"
import { Bot, ChevronDown, Infinity } from "lucide-react"

type Mode = "agent" | "council"

export function ChatModeSelector({
	mode,
	onSelectMode,
}: {
	mode: Mode
	onSelectMode: (mode: Mode) => void
}) {
	const isAgent = mode === "agent"
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<button
					className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[13px] hover:bg-white/5 transition-colors"
					type="button"
				>
					{isAgent ? (
						<Infinity className="size-3.5" />
					) : (
						<Bot className="size-3.5" />
					)}
					<span>{isAgent ? "Agent" : "Council"}</span>
					<ChevronDown className="size-3.5" />
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent
				align="start"
				className="border-white/10 bg-[#0b0d12] text-zinc-100 z-[140]"
				side="top"
			>
				<DropdownMenuItem
					className={isAgent ? "text-zinc-100" : "cursor-pointer text-zinc-300"}
					onSelect={() => onSelectMode("agent")}
				>
					Agent
				</DropdownMenuItem>
				<DropdownMenuItem
					className={!isAgent ? "text-zinc-100" : "cursor-pointer text-zinc-300"}
					onSelect={() => onSelectMode("council")}
				>
					Council
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	)
}
