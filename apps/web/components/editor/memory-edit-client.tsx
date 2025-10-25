"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, ChevronDown, MessageSquare } from "lucide-react";
import { Button } from "@repo/ui/components/button";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@repo/ui/components/collapsible";
import { cn } from "@lib/utils";
import { useIsMobile } from "@hooks/use-mobile";
import type { DocumentWithMemories } from "@/lib/types/document";
import { useChatOpen } from "@/stores";
import { ChatRewrite } from "@/components/views/chat";
import { MemoryEntriesSidebar } from "./memory-entries-sidebar";
import { RichEditorWrapper } from "./rich-editor-wrapper";
import Link from "next/link";

interface MemoryEditClientProps {
	document: DocumentWithMemories;
}

export function MemoryEditClient({ document: memoryDocument }: MemoryEditClientProps) {
	const isMobile = useIsMobile();
	const { isOpen, setIsOpen } = useChatOpen();

	// Resizable chat panel width (desktop only)
	const MIN_CHAT_WIDTH = 420;
	const MAX_CHAT_WIDTH = 1100;
	const [chatWidth, setChatWidth] = useState<number>(() => {
		if (typeof window === "undefined") return 600;
		const stored = Number(localStorage.getItem("chatPanelWidth"));
		return Number.isFinite(stored)
			? Math.min(MAX_CHAT_WIDTH, Math.max(MIN_CHAT_WIDTH, stored))
			: 600;
	});

	useEffect(() => {
		try {
			localStorage.setItem("chatPanelWidth", String(chatWidth));
		} catch {
			// ignore storage errors
		}
	}, [chatWidth]);

	const resizingRef = useRef(false);
	const startXRef = useRef(0);
	const startWidthRef = useRef(0);

	const onResizeStart = (event: React.MouseEvent<HTMLDivElement>) => {
		if (isMobile) return;
		resizingRef.current = true;
		startXRef.current = event.clientX;
		startWidthRef.current = chatWidth;
		document.body.style.cursor = "ew-resize";

		const handleMouseMove = (e: MouseEvent) => {
			if (!resizingRef.current) return;
			const delta = startXRef.current - e.clientX;
			const next = Math.min(
				MAX_CHAT_WIDTH,
				Math.max(MIN_CHAT_WIDTH, startWidthRef.current + delta)
			);
			setChatWidth(next);
		};

		const handleMouseUp = () => {
			resizingRef.current = false;
			document.body.style.cursor = "";
			window.removeEventListener("mousemove", handleMouseMove);
			window.removeEventListener("mouseup", handleMouseUp);
		};

		window.addEventListener("mousemove", handleMouseMove);
		window.addEventListener("mouseup", handleMouseUp);
		event.preventDefault();
	};

	const [isContentOpen, setIsContentOpen] = useState(false);

	const documentTitle = memoryDocument.title || "Untitled document";

	return (
		<div className="relative h-screen bg-[#0f1419] overflow-hidden">
			<motion.div
				animate={{
					marginRight: isOpen && !isMobile ? chatWidth : 0,
				}}
				className="flex h-full flex-col"
				transition={{
					duration: 0.2,
					ease: [0.4, 0, 0.2, 1],
				}}
			>
				<header className="flex flex-col gap-2 border-b border-white/10 bg-[#0f1419]/90 px-6 py-4 backdrop-blur">
					<div className="flex items-center justify-between gap-4">
						<div className="min-w-0">
							<p className="text-xs uppercase tracking-wide text-white/50">
								Memory
							</p>
							<h1 className="truncate text-xl font-semibold text-white">
								{documentTitle}
							</h1>
						</div>
						<Button
							asChild
							size="sm"
							variant="outline"
							className="border-white/20 bg-white/5 text-white/80 hover:bg-white/10"
						>
							<Link className="flex items-center gap-2" href="/">
								<ArrowLeft className="h-4 w-4" />
								<span>Voltar ao dashboard</span>
							</Link>
						</Button>
					</div>
					<p className="text-sm text-white/60">
						Gerencie as memórias e revise o conteúdo original quando necessário.
					</p>
				</header>

				<main className="flex-1 overflow-y-auto">
					<div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
						<MemoryEntriesSidebar
							documentId={memoryDocument.id}
							document={memoryDocument}
							variant="standalone"
						/>

						<Collapsible open={isContentOpen} onOpenChange={setIsContentOpen}>
							<CollapsibleTrigger asChild>
								<button
									className="flex w-full items-center justify-between rounded-2xl border border-white/10 bg-[#0f1419]/80 px-5 py-4 text-left text-white/80 transition hover:bg-white/10"
									type="button"
								>
									<span className="text-sm font-semibold">
										Conteúdo original
									</span>
									<ChevronDown
										className={cn(
											"h-4 w-4 transition-transform duration-200",
											isContentOpen ? "rotate-180" : ""
										)}
									/>
								</button>
							</CollapsibleTrigger>
							<AnimatePresence initial={false}>
								{isContentOpen ? (
									<CollapsibleContent asChild>
										<motion.div
											className="mt-4 overflow-hidden rounded-2xl border border-white/10 bg-[#0f1419]"
											initial={{ opacity: 0, height: 0 }}
											animate={{ opacity: 1, height: "auto" }}
											exit={{ opacity: 0, height: 0 }}
											transition={{ duration: 0.2 }}
										>
											<div className="h-[70vh] min-h-[420px]">
												<RichEditorWrapper
													document={memoryDocument}
													showNavigation={true}
												/>
											</div>
										</motion.div>
									</CollapsibleContent>
								) : null}
							</AnimatePresence>
						</Collapsible>
					</div>
				</main>
			</motion.div>

			{/* Floating Open Chat Button */}
			{!isOpen && !isMobile && (
				<motion.div
					animate={{ opacity: 1, scale: 1 }}
					className="fixed bottom-6 right-6 z-50"
					initial={{ opacity: 0, scale: 0.8 }}
					transition={{
						type: "spring",
						stiffness: 300,
						damping: 25,
					}}
				>
					<Button
						className="flex h-14 w-14 items-center justify-center rounded-full bg-white p-0 text-[#001A39] shadow-lg transition-all duration-200 hover:bg-white/80 hover:shadow-xl"
						onClick={() => setIsOpen(true)}
					>
						<MessageSquare className="h-6 w-6" />
					</Button>
				</motion.div>
			)}

			{/* Chat panel */}
			<motion.div
				className="fixed top-0 right-0 z-50 h-full md:z-auto"
				style={{
					width: isOpen ? (isMobile ? "100vw" : `${chatWidth}px`) : 0,
					pointerEvents: isOpen ? "auto" : "none",
				}}
			>
				<motion.div
					animate={{ x: isOpen ? 0 : isMobile ? "100%" : chatWidth }}
					className="absolute inset-0"
					exit={{ x: isMobile ? "100%" : chatWidth }}
					initial={{ x: isMobile ? "100%" : chatWidth }}
					transition={{
						type: "spring",
						stiffness: 500,
						damping: 40,
					}}
				>
					{/* Resize handle */}
					{!isMobile && (
						<div
							className="absolute left-0 top-0 h-full w-1 cursor-ew-resize bg-transparent"
							onMouseDown={onResizeStart}
						>
							<div className="absolute left-1/2 top-1/2 h-20 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/10 bg-white/10" />
						</div>
					)}
					<ChatRewrite />
				</motion.div>
			</motion.div>
		</div>
	);
}
