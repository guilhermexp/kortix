"use client"

import { cn } from "@lib/utils"
import { Button } from "@ui/components/button"
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@ui/components/dialog"
import { ScrollArea } from "@ui/components/scroll-area"
import { formatDistanceToNow } from "date-fns"
import { HistoryIcon, Plus, Trash2, X } from "lucide-react"
import { useMemo, useState } from "react"
import { analytics } from "@/lib/analytics"
import { useChatOpen, usePersistentChat, useProject } from "@/stores"
import { ChatMessages } from "./chat-messages"

export function ChatRewrite() {
	const { setIsOpen } = useChatOpen()
	const { selectedProject } = useProject()
	const {
		conversations,
		currentChatId,
		setCurrentChatId,
		deleteConversation,
		getCurrentChat,
	} = usePersistentChat()

	const [isDialogOpen, setIsDialogOpen] = useState(false)

	const sorted = useMemo(() => {
		return [...conversations].sort((a, b) =>
			a.lastUpdated < b.lastUpdated ? 1 : -1,
		)
	}, [conversations])

	function handleNewChat() {
		analytics.newChatStarted()
		const newId = crypto.randomUUID()
		setCurrentChatId(newId)
		setIsDialogOpen(false)
	}

	function formatRelativeTime(isoString: string): string {
		return formatDistanceToNow(new Date(isoString), { addSuffix: true })
	}

	// No header controls (kept only in composer)

	return (
		<div className="flex flex-col h-full overflow-y-hidden border-l border-border bg-chat-surface">
			<div className="sticky top-0 z-20 border-b border-border/50 bg-chat-surface backdrop-blur px-4 py-3 flex justify-between items-center shadow-sm">
				<h3 className="text-base font-semibold line-clamp-1 text-ellipsis overflow-hidden text-foreground">
					{getCurrentChat()?.title ?? "New Chat"}
				</h3>
				<div className="flex items-center gap-2">
					<Dialog onOpenChange={setIsDialogOpen} open={isDialogOpen}>
						<DialogTrigger asChild>
							<Button
								className="h-8 w-8 bg-muted/50 hover:bg-muted border border-border rounded-md text-foreground"
								onClick={() => analytics.chatHistoryViewed()}
								size="icon"
								variant="ghost"
							>
								<HistoryIcon className="size-4" />
							</Button>
						</DialogTrigger>
						<DialogContent className="sm:max-w-lg bg-popover backdrop-blur-xl border-border text-foreground">
							<DialogHeader className="pb-4 border-b border-border rounded-t-lg">
								<DialogTitle className="text-foreground">
									Conversations
								</DialogTitle>
								<DialogDescription className="text-muted-foreground">
									Project{" "}
									<span className="font-mono font-medium text-foreground/80">
										{selectedProject}
									</span>
								</DialogDescription>
							</DialogHeader>

							<ScrollArea className="max-h-96">
								<div className="flex flex-col gap-1">
									{sorted.map((c) => {
										const isActive = c.id === currentChatId
										return (
											<div
												aria-current={isActive ? "true" : undefined}
												className={cn(
													"group flex items-center justify-between rounded-md px-3 py-2",
													"transition-colors",
													isActive ? "bg-primary/10" : "hover:bg-muted",
												)}
												key={c.id}
											>
												<button
													className="min-w-0 flex-1 text-left outline-none"
													onClick={() => {
														setCurrentChatId(c.id)
														setIsDialogOpen(false)
													}}
													type="button"
												>
													<div className="flex items-center gap-2">
														<span
															className={cn(
																"text-sm font-medium truncate",
																isActive ? "text-foreground" : undefined,
															)}
														>
															{c.title || "Untitled Chat"}
														</span>
													</div>
													<div className="text-xs text-muted-foreground">
														Last updated {formatRelativeTime(c.lastUpdated)}
													</div>
												</button>
												<Button
													aria-label="Delete conversation"
													onClick={(e) => {
														e.stopPropagation()
														analytics.chatDeleted()
														if (isActive) {
															setCurrentChatId(null)
														}
														deleteConversation(c.id)
													}}
													size="icon"
													type="button"
													variant="ghost"
												>
													<Trash2 className="size-4 text-muted-foreground" />
												</Button>
											</div>
										)
									})}
									{sorted.length === 0 && (
										<div className="text-xs text-muted-foreground px-3 py-2">
											No conversations yet
										</div>
									)}
								</div>
							</ScrollArea>
							<Button
								className="w-full border-dashed"
								onClick={handleNewChat}
								size="lg"
								variant="outline"
							>
								<Plus className="size-4 mr-1" /> New Conversation
							</Button>
						</DialogContent>
					</Dialog>
					<Button
						className="h-8 w-8 bg-muted/50 hover:bg-muted border border-border rounded-md text-foreground"
						onClick={handleNewChat}
						size="icon"
						variant="ghost"
					>
						<Plus className="size-4" />
					</Button>
					<Button
						className="h-8 w-8 bg-muted/50 hover:bg-muted border border-border rounded-md text-foreground"
						onClick={() => setIsOpen(false)}
						size="icon"
						variant="ghost"
					>
						<X className="size-4" />
					</Button>
				</div>
			</div>
			<ChatMessages />
		</div>
	)
}
