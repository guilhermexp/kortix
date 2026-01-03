"use client"

import { useIsMobile } from "@hooks/use-mobile"
import { useCustomer } from "@lib/autumn-stub"
import {
	fetchConsumerProProduct,
	fetchMemoriesFeature,
} from "@repo/lib/queries"
import { Button } from "@repo/ui/components/button"
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@repo/ui/components/dialog"
import { ScrollArea } from "@repo/ui/components/scroll-area"
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@repo/ui/components/tooltip"
import { HeadingH2Bold } from "@repo/ui/text/heading/heading-h2-bold"
import { GlassMenuEffect } from "@ui/other/glass-effect"
import {
	LayoutGrid,
	List,
	MessageSquareMore,
	Network,
	Plus,
	Puzzle,
	User,
	X,
} from "lucide-react"
import { AnimatePresence, motion } from "motion/react"
import { useRouter, useSearchParams } from "next/navigation"
import React, { useCallback, useEffect, useRef, useState } from "react"
import { Drawer } from "vaul"
import { useMobilePanel } from "@/lib/mobile-panel-context"
import { TOUR_STEP_IDS } from "@/lib/tour-constants"
import { useViewMode } from "@/lib/view-mode-context"
import { useChatOpen } from "@/stores"
import { ConnectAIModal } from "./connect-ai-modal"
import { ProjectSelector } from "./project-selector"
import { AddMemoryExpandedView, AddMemoryView } from "./views/add-memory"
import { IntegrationsView } from "./views/integrations"
import { ProfileView } from "./views/profile"

export const MCPIcon = ({ className }: { className?: string }) => {
	return (
		<svg
			className={className}
			fill="currentColor"
			fillRule="evenodd"
			viewBox="0 0 24 24"
			xmlns="http://www.w3.org/2000/svg"
		>
			<title>ModelContextProtocol</title>
			<path d="M15.688 2.343a2.588 2.588 0 00-3.61 0l-9.626 9.44a.863.863 0 01-1.203 0 .823.823 0 010-1.18l9.626-9.44a4.313 4.313 0 016.016 0 4.116 4.116 0 011.204 3.54 4.3 4.3 0 013.609 1.18l.05.05a4.115 4.115 0 010 5.9l-8.706 8.537a.274.274 0 000 .393l1.788 1.754a.823.823 0 010 1.18.863.863 0 01-1.203 0l-1.788-1.753a1.92 1.92 0 010-2.754l8.706-8.538a2.47 2.47 0 000-3.54l-.05-.049a2.588 2.588 0 00-3.607-.003l-7.172 7.034-.002.002-.098.097a.863.863 0 01-1.204 0 .823.823 0 010-1.18l7.273-7.133a2.47 2.47 0 00-.003-3.537z" />
			<path d="M14.485 4.703a.823.823 0 000-1.18.863.863 0 00-1.204 0l-7.119 6.982a4.115 4.115 0 000 5.9 4.314 4.314 0 006.016 0l7.12-6.982a.823.823 0 000-1.18.863.863 0 00-1.204 0l-7.119 6.982a2.588 2.588 0 01-3.61 0 2.47 2.47 0 010-3.54l7.12-6.982z" />
		</svg>
	)
}

function Menu({
	id,
	chatRightOffset = 0,
}: {
	id?: string
	chatRightOffset?: number
}) {
	const router = useRouter()
	const searchParams = useSearchParams()
	const openParam = searchParams.get("open")

	// Valid view names that can be opened via URL parameter
	const validViews = [
		"addUrl",
		"mcp",
		"projects",
		"profile",
		"integrations",
	] as const
	type ValidView = (typeof validViews)[number]

	const [_isHovered, _setIsHovered] = useState(false)
	const [expandedView, setExpandedView] = useState<
		"addUrl" | "mcp" | "projects" | "profile" | "integrations" | null
	>(null)
	const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
	const [_isCollapsing, setIsCollapsing] = useState(false)
	const [showAddMemoryView, setShowAddMemoryView] = useState(false)
	const [showConnectAIModal, setShowConnectAIModal] = useState(false)
	const [showProfileModal, setShowProfileModal] = useState(false)
	const isClickProcessingRef = useRef(false)
	const buttonClickedRef = useRef(false)
	const isMobile = useIsMobile()
	const { activePanel, setActivePanel } = useMobilePanel()
	const autumn = useCustomer()
	const { setIsOpen, isOpen: isChatPanelOpen } = useChatOpen()
	const { setViewMode } = useViewMode()

	const { data: memoriesCheck } = fetchMemoriesFeature(autumn)

	const memoriesUsed = memoriesCheck?.usage ?? 0
	const memoriesLimit = memoriesCheck?.included_usage ?? 0

	const { data: proCheck } = fetchConsumerProProduct(autumn)

	useEffect(() => {
		if (memoriesCheck) {
			console.log({ memoriesCheck })
		}

		if (proCheck) {
			console.log({ proCheck })
		}
	}, [memoriesCheck, proCheck])

	// Function to clear the 'open' parameter from URL
	const clearOpenParam = useCallback(() => {
		const newSearchParams = new URLSearchParams(searchParams.toString())
		newSearchParams.delete("open")
		const newUrl = `${window.location.pathname}${newSearchParams.toString() ? `?${newSearchParams.toString()}` : ""}`
		router.replace(newUrl)
	}, [searchParams, router])

	const isProUser = proCheck?.allowed ?? false

	const shouldShowLimitWarning =
		!isProUser && memoriesUsed >= memoriesLimit * 0.8

	// Map menu item keys to tour IDs
	const menuItemTourIds: Record<string, string> = {
		addUrl: TOUR_STEP_IDS.MENU_ADD_MEMORY,
		projects: TOUR_STEP_IDS.MENU_PROJECTS,
		mcp: TOUR_STEP_IDS.MENU_MCP,
		integrations: "", // No tour ID for integrations yet
	}

	const menuItems = [
		{
			icon: Plus,
			text: "Add Memory",
			key: "addUrl" as const,
			disabled: false,
		},
		{
			icon: MessageSquareMore,
			text: "Chat",
			key: "chat" as const,
			disabled: false,
		},
		{
			icon: List,
			text: "List",
			key: "list" as const,
			disabled: false,
		},
		{
			icon: Network,
			text: "Graph",
			key: "graph" as const,
			disabled: false,
		},
		{
			icon: LayoutGrid,
			text: "Canvas",
			key: "canvas" as const,
			disabled: false,
		},
		{
			icon: Puzzle,
			text: "Connections",
			key: "connections" as const,
			disabled: false,
		},
		{
			icon: User,
			text: "Profile",
			key: "profile" as const,
			disabled: false,
		},
	]

	const handleMenuItemClick = (
		key:
			| "chat"
			| "addUrl"
			| "connections"
			| "projects"
			| "profile"
			| "canvas"
			| "list"
			| "graph",
	) => {
		// Prevent multiple rapid clicks
		if (isClickProcessingRef.current) {
			console.log("[Menu] Click blocked - already processing")
			return
		}
		isClickProcessingRef.current = true
		setTimeout(() => {
			isClickProcessingRef.current = false
		}, 300)

		console.log("[Menu] handleMenuItemClick called with key:", key)
		if (key === "chat") {
			// Toggle chat panel
			setIsOpen(!isChatPanelOpen)
			setIsMobileMenuOpen(false)
			if (isMobile && !isChatPanelOpen) {
				setActivePanel("chat")
			}
		} else if (key === "list") {
			// Switch to list view mode
			setViewMode("list")
			router.push("/")
			setIsMobileMenuOpen(false)
			setExpandedView(null)
		} else if (key === "graph") {
			// Switch to graph view mode
			setViewMode("graph")
			router.push("/")
			setIsMobileMenuOpen(false)
			setExpandedView(null)
		} else if (key === "canvas") {
			// Switch to infinity canvas view mode
			setViewMode("infinity")
			router.push("/")
			setIsMobileMenuOpen(false)
			setExpandedView(null)
		} else if (key === "connections") {
			// Mark that button was clicked (prevents Dialog's onOpenChange from reopening)
			buttonClickedRef.current = true
			setTimeout(() => {
				buttonClickedRef.current = false
			}, 100)
			setIsMobileMenuOpen(false)
			setExpandedView(null)
			setShowConnectAIModal(!showConnectAIModal)
		} else if (key === "profile") {
			// Mark that button was clicked (prevents Dialog's onOpenChange from reopening)
			buttonClickedRef.current = true
			setTimeout(() => {
				buttonClickedRef.current = false
			}, 100)
			setIsMobileMenuOpen(false)
			setExpandedView(null)
			setShowProfileModal(!showProfileModal)
		} else if (key === "addUrl") {
			// Toggle Add Memory view
			setExpandedView(null)
			setIsMobileMenuOpen(false)
			setShowAddMemoryView((prev) => !prev)
		} else {
			if (expandedView === key) {
				setIsCollapsing(true)
				setExpandedView(null)
			} else {
				setExpandedView(key)
			}
			if (isMobile) {
				setActivePanel("menu")
			}
		}
	}

	// Handle initial view opening based on URL parameter
	useEffect(() => {
		if (openParam) {
			if (openParam === "chat") {
				setIsOpen(true)
				setIsMobileMenuOpen(false)
				if (isMobile) {
					setActivePanel("chat")
				}
			} else if (
				openParam === "mcp" ||
				openParam === "connections" ||
				openParam === "integrations"
			) {
				// Open ConnectAIModal (combined MCP + Integrations)
				setIsMobileMenuOpen(false)
				setExpandedView(null)
				setShowConnectAIModal(true)
			} else if (openParam === "profile") {
				// Open Profile modal
				setIsMobileMenuOpen(false)
				setExpandedView(null)
				setShowProfileModal(true)
			} else if (openParam === "addUrl") {
				setShowAddMemoryView(true)
				setExpandedView(null)
				if (isMobile) {
					setIsMobileMenuOpen(true)
					setActivePanel("menu")
				}
			} else if (validViews.includes(openParam as ValidView)) {
				// For other valid views
				setExpandedView(openParam as ValidView)
				if (isMobile) {
					setIsMobileMenuOpen(true)
					setActivePanel("menu")
				}
			}

			// Clear the parameter from URL after performing any action
			clearOpenParam()
		}
	}, [
		openParam,
		isMobile,
		setIsOpen,
		setActivePanel,
		validViews,
		clearOpenParam,
	])

	// Watch for active panel changes on mobile
	useEffect(() => {
		if (isMobile && activePanel !== "menu" && activePanel !== null) {
			// Another panel became active, close the menu
			setIsMobileMenuOpen(false)
			setExpandedView(null)
		}
	}, [isMobile, activePanel])

	// Collapse menu to icons when chat panel is open (desktop only)
	const isCollapsedToIcons = !isMobile && !expandedView && isChatPanelOpen
	const _menuWidth = isCollapsedToIcons ? 280 : 600

	// Dynamic z-index for mobile based on active panel
	const mobileZIndex = isMobile && activePanel === "menu" ? "z-[70]" : "z-[100]"

	return (
		<>
			{/* Desktop Floating Sidebar Menu */}
			{!isMobile && (
				<TooltipProvider delayDuration={100}>
					{/* Floating Menu Container - Centered on left side */}
					<div className="fixed left-4 top-1/2 -translate-y-1/2 z-[10000] pointer-events-auto">
						<motion.nav
							animate={{ x: 0, opacity: 1, scale: 1 }}
							className="flex flex-col items-center py-2 px-1.5 bg-background border border-border rounded-xl shadow-2xl"
							id={id}
							initial={{ x: -20, opacity: 0, scale: 0.95 }}
							transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
						>
							{/* Menu Items */}
							<div className="flex flex-col items-center gap-1">
								{menuItems.map((item, index) => (
									<React.Fragment key={item.key}>
										{index === 1 && <div className="w-6 h-px bg-border my-1" />}
										<Tooltip>
											<TooltipTrigger asChild>
												<motion.button
													aria-label={item.text}
													className="flex items-center justify-center w-9 h-9 rounded-lg text-foreground/70 hover:text-foreground hover:bg-foreground/10 transition-all duration-150 cursor-pointer"
													id={menuItemTourIds[item.key]}
													onClick={(e) => {
														e.stopPropagation()
														e.preventDefault()
														handleMenuItemClick(item.key)
													}}
													type="button"
													whileHover={{ scale: 1.05 }}
													whileTap={{ scale: 0.95 }}
												>
													<item.icon className="h-5 w-5" />
												</motion.button>
											</TooltipTrigger>
											<TooltipContent side="right" sideOffset={8}>
												{item.text}
											</TooltipContent>
										</Tooltip>
									</React.Fragment>
								))}
							</div>
						</motion.nav>
					</div>
				</TooltipProvider>
			)}

			{/* Mobile Menu with Vaul Drawer */}
			{isMobile && (
				<Drawer.Root
					onOpenChange={(open) => {
						if (!open) {
							setIsMobileMenuOpen(false)
							setExpandedView(null)
							setActivePanel(null)
						}
					}}
					open={isMobileMenuOpen || !!expandedView}
				>
					{/* Menu Trigger Button */}
					{!isMobileMenuOpen && !expandedView && (
						<Drawer.Trigger asChild>
							<div className={`fixed bottom-8 right-6 z-100 ${mobileZIndex}`}>
								<motion.button
									animate={{ scale: 1, opacity: 1 }}
									className="w-14 h-14 flex items-center justify-center text-foreground rounded-full shadow-2xl"
									initial={{ scale: 0.8, opacity: 0 }}
									onClick={() => {
										setIsMobileMenuOpen(true)
										setActivePanel("menu")
									}}
									transition={{
										duration: 0.3,
										ease: [0.4, 0, 0.2, 1],
									}}
									type="button"
									whileHover={{ scale: 1.05 }}
									whileTap={{ scale: 0.95 }}
								>
									{/* Glass effect background */}
									<div className="absolute inset-0 rounded-full">
										<GlassMenuEffect rounded="rounded-full" />
									</div>
									<svg
										className="h-6 w-6 relative z-10"
										fill="none"
										stroke="currentColor"
										strokeWidth={2}
										viewBox="0 0 24 24"
									>
										<title>Open menu</title>
										<path
											d="M4 6h16M4 12h16M4 18h16"
											strokeLinecap="round"
											strokeLinejoin="round"
										/>
									</svg>
								</motion.button>
							</div>
						</Drawer.Trigger>
					)}

					<Drawer.Portal>
						<Drawer.Overlay className="fixed inset-0 bg-black/40 z-[60]" />
						<Drawer.Content className="bg-transparent fixed bottom-0 left-0 right-0 z-[70] outline-none">
							<Drawer.Title className="sr-only">
								{expandedView === "addUrl" && "Add Memory"}
								{expandedView === "mcp" && "Model Context Protocol"}
								{expandedView === "profile" && "Profile"}
								{!expandedView && "Menu"}
							</Drawer.Title>
							<div className="w-full flex flex-col text-sm font-medium shadow-2xl relative overflow-hidden rounded-t-3xl max-h-[80vh]">
								{/* Glass effect background */}
								<div className="absolute inset-0 rounded-t-3xl">
									<GlassMenuEffect rounded="rounded-t-3xl" />
								</div>

								{/* Drag Handle */}
								<div className="relative z-20 flex justify-center py-3">
									<div className="w-12 h-1 bg-border/50 rounded-full" />
								</div>

								{/* Menu content */}
								<div className="relative z-20 flex flex-col w-full px-2 pb-8">
									<AnimatePresence
										initial={false}
										mode="wait"
										onExitComplete={() => setIsCollapsing(false)}
									>
										{!expandedView ? (
											<motion.div
												animate={{ opacity: 1 }}
												className="w-full flex flex-col gap-6"
												exit={{ opacity: 0 }}
												initial={{ opacity: 0 }}
												key="menu-items-mobile"
												layout
											>
												<motion.div
													animate={{ opacity: 1, y: 0 }}
													initial={{ opacity: 0, y: -10 }}
													transition={{ delay: 0.08 }}
												>
													<ProjectSelector />
												</motion.div>

												{/* Menu Items */}
												<div className="flex flex-col gap-3">
													{menuItems.map((item, index) => (
														<div key={item.key}>
															<motion.button
																animate={{
																	opacity: 1,
																	y: 0,
																	transition: {
																		delay: 0.1 + index * 0.05,
																		duration: 0.3,
																		ease: "easeOut",
																	},
																}}
																className="flex w-full items-center gap-3 px-2 py-2 text-foreground/90 hover:text-foreground hover:bg-muted/50 rounded-lg cursor-pointer relative"
																id={menuItemTourIds[item.key]}
																initial={{ opacity: 0, y: 10 }}
																layout
																onClick={() => {
																	handleMenuItemClick(item.key)
																	// Close mobile menu for all items
																	setIsMobileMenuOpen(false)
																}}
																type="button"
																whileHover={{ scale: 1.05 }}
																whileTap={{ scale: 0.95 }}
															>
																<item.icon className="h-5 w-5 drop-shadow-lg flex-shrink-0" />
																<span className="drop-shadow-lg text-sm font-medium flex-1 text-left">
																	{item.text}
																</span>
																{/* Show warning indicator for Add Memory when limits approached */}
																{shouldShowLimitWarning &&
																	item.key === "addUrl" && (
																		<span className="text-xs bg-yellow-500/20 text-yellow-400 px-1.5 py-0.5 rounded">
																			{memoriesLimit - memoriesUsed} left
																		</span>
																	)}
															</motion.button>
															{/* Add horizontal line after first item */}
															{index === 0 && (
																<motion.div
																	animate={{
																		opacity: 1,
																		scaleX: 1,
																	}}
																	className="w-full h-px bg-border mt-2 origin-left"
																	initial={{ opacity: 0, scaleX: 0 }}
																	transition={{
																		duration: 0.3,
																		delay: 0.15 + index * 0.05,
																		ease: [0.4, 0, 0.2, 1],
																	}}
																/>
															)}
														</div>
													))}
												</div>
											</motion.div>
										) : (
											<motion.div
												animate={{ opacity: 1 }}
												className="w-full px-2 flex flex-col"
												exit={{ opacity: 0 }}
												initial={{ opacity: 0 }}
												key="expanded-view-mobile"
												layout
											>
												<div className="flex-1">
													<motion.div
														className="flex items-center justify-between"
														layout
													>
														<HeadingH2Bold className="text-foreground">
															{expandedView === "addUrl" && "Add Memory"}
															{expandedView === "mcp" &&
																"Model Context Protocol"}
															{expandedView === "profile" && "Profile"}
															{expandedView === "integrations" &&
																"Integrations"}
														</HeadingH2Bold>
														<Button
															className="text-foreground dark:text-white/70 hover:text-foreground dark:text-white transition-colors duration-200 pointer-events-auto relative z-10"
															onClick={() => {
																setIsCollapsing(true)
																setExpandedView(null)
															}}
															size="icon"
															variant="ghost"
														>
															<X className="h-5 w-5" />
														</Button>
													</motion.div>
													<div className="max-h-[60vh] overflow-y-auto pr-1">
														{expandedView === "addUrl" && (
															<AddMemoryExpandedView />
														)}
														{expandedView === "profile" && <ProfileView />}
														{expandedView === "integrations" && (
															<IntegrationsView />
														)}
													</div>
												</div>
											</motion.div>
										)}
									</AnimatePresence>
								</div>
							</div>
						</Drawer.Content>
					</Drawer.Portal>
				</Drawer.Root>
			)}

			{showAddMemoryView && (
				<AddMemoryView onClose={() => setShowAddMemoryView(false)} />
			)}

			<ConnectAIModal
				onOpenChange={(open) => {
					// Only update if the button wasn't just clicked
					// This prevents the dialog from reopening after button click closes it
					if (!buttonClickedRef.current) {
						setShowConnectAIModal(open)
					}
				}}
				open={showConnectAIModal}
			/>

			{/* Profile Modal */}
			<Dialog
				onOpenChange={(open) => {
					// Only update if the button wasn't just clicked
					if (!buttonClickedRef.current) {
						setShowProfileModal(open)
					}
				}}
				open={showProfileModal}
			>
				<DialogContent className="sm:max-w-md max-h-[85vh] overflow-hidden">
					<DialogHeader>
						<DialogTitle>Profile</DialogTitle>
						<DialogDescription className="sr-only">
							Manage your profile settings and subscription
						</DialogDescription>
					</DialogHeader>
					<ScrollArea className="max-h-[70vh] pr-4">
						<ProfileView />
					</ScrollArea>
				</DialogContent>
			</Dialog>
		</>
	)
}

export default Menu
