"use client"

import { Button } from "@repo/ui/components/button"
import { ChatRewrite } from "@/components/views/chat"
import { useChatOpen } from "@/stores"

export function EditorChatSidebar() {
	const { isOpen, setIsOpen } = useChatOpen()

	if (!isOpen) {
		return (
			<div className="h-full w-full border-l border-white/10 bg-[#0f1419] flex items-center justify-center p-6">
				<div className="space-y-3 text-center text-white/70">
					<p>O chat está fechado. Deseja abri-lo aqui?</p>
					<Button onClick={() => setIsOpen(true)} size="sm" variant="outline">
						Abrir chat
					</Button>
				</div>
			</div>
		)
	}

	return (
		<div className="h-full w-full border-l border-white/10">
			<ChatRewrite />
		</div>
	)
}
