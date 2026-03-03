import { useQueryClient } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import "./App.css"
import { validateAuthToken } from "../../utils/api"
import {
	API_ENDPOINTS,
	getContainerTagForUrl,
	MESSAGE_TYPES,
	STORAGE_KEYS,
} from "../../utils/constants"
import { useProjects, useUserData } from "../../utils/query-hooks"

function isTwitterPageUrl(url: string): boolean {
	try {
		const hostname = new URL(url).hostname
		return (
			hostname === "x.com" ||
			hostname === "twitter.com" ||
			hostname.endsWith(".x.com") ||
			hostname.endsWith(".twitter.com")
		)
	} catch {
		return false
	}
}

/**
 * Human-readable labels for container tags (fallback when project not found in list).
 */
const CONTAINER_TAG_LABELS: Record<string, string> = {
	sm_project_youtube: "YouTube",
	sm_project_twitter_bookmarks: "Twitter Bookmarks",
	sm_project_github: "GitHub",
	sm_project_digitalmemory: "Digitalmemory",
	sm_project_default: "Digitalmemory",
}

function App() {
	const [userSignedIn, setUserSignedIn] = useState<boolean>(false)
	const [loading, setLoading] = useState<boolean>(true)
	const [currentUrl, setCurrentUrl] = useState<string>("")
	const [currentTitle, setCurrentTitle] = useState<string>("")
	const [saving, setSaving] = useState<boolean>(false)
	const [activeTab, setActiveTab] = useState<"save" | "imports" | "settings">(
		"save",
	)
	const [autoSearchEnabled, setAutoSearchEnabled] = useState<boolean>(false)
	const [savePageButtonEnabled, setSavePageButtonEnabled] =
		useState<boolean>(false)
	const [authInvalidated, setAuthInvalidated] = useState<boolean>(false)
	const [xGridActive, setXGridActive] = useState<boolean>(false)
	const [xGridLoading, setXGridLoading] = useState<boolean>(false)

	const queryClient = useQueryClient()
	const { data: projects = [] } = useProjects({
		enabled: userSignedIn,
	})
	const { data: userData, isLoading: loadingUserData } = useUserData({
		enabled: userSignedIn,
	})

	useEffect(() => {
		const checkAuthStatus = async () => {
			try {
				const result = await chrome.storage.local.get([
					STORAGE_KEYS.BEARER_TOKEN,
					STORAGE_KEYS.AUTO_SEARCH_ENABLED,
					STORAGE_KEYS.SAVE_PAGE_BUTTON_ENABLED,
				])
				const hasToken = !!result[STORAGE_KEYS.BEARER_TOKEN]

				if (hasToken) {
					const isTokenValid = await validateAuthToken()

					if (isTokenValid) {
						setUserSignedIn(true)
						setAuthInvalidated(false)
					} else {
						await chrome.storage.local.remove([
							STORAGE_KEYS.BEARER_TOKEN,
							STORAGE_KEYS.USER_DATA,
							STORAGE_KEYS.DEFAULT_PROJECT,
						])
						queryClient.clear()
						setUserSignedIn(false)
						setAuthInvalidated(true)
					}
				} else {
					setUserSignedIn(false)
					setAuthInvalidated(false)
				}

				const autoSearchSetting =
					result[STORAGE_KEYS.AUTO_SEARCH_ENABLED] ?? false
				setAutoSearchEnabled(Boolean(autoSearchSetting))

				const savePageBtnSetting =
					result[STORAGE_KEYS.SAVE_PAGE_BUTTON_ENABLED] ?? false
				setSavePageButtonEnabled(Boolean(savePageBtnSetting))
			} catch (error) {
				console.error("Error checking auth status:", error)
				setUserSignedIn(false)
				setAuthInvalidated(false)
			} finally {
				setLoading(false)
			}
		}

		const getCurrentTab = async () => {
			try {
				const tabs = await chrome.tabs.query({
					active: true,
					currentWindow: true,
				})
				if (tabs.length > 0 && tabs[0].url) {
					setCurrentUrl(tabs[0].url)
					setCurrentTitle(tabs[0].title ?? "")

					if (tabs[0].id && isTwitterPageUrl(tabs[0].url)) {
						try {
							const response = await chrome.tabs.sendMessage(tabs[0].id, {
								action: MESSAGE_TYPES.GET_X_GRID_STATE,
							})
							setXGridActive(Boolean(response?.active))
						} catch {
							setXGridActive(false)
						}
					} else {
						setXGridActive(false)
					}
				}
			} catch (error) {
				console.error("Error getting current tab:", error)
			}
		}

		checkAuthStatus()
		getCurrentTab()
	}, [])

	const handleSaveCurrentPage = async () => {
		setSaving(true)

		try {
			const tabs = await chrome.tabs.query({
				active: true,
				currentWindow: true,
			})
			if (tabs.length > 0 && tabs[0].id) {
				const response = await chrome.tabs.sendMessage(tabs[0].id, {
					action: MESSAGE_TYPES.SAVE_MEMORY,
					actionSource: "popup",
				})

				if (response?.success) {
					await chrome.tabs.sendMessage(tabs[0].id, {
						action: MESSAGE_TYPES.SHOW_TOAST,
						state: "success",
					})
				}

				window.close()
			}
		} catch (error) {
			console.error("Failed to save current page:", error)

			try {
				const tabs = await chrome.tabs.query({
					active: true,
					currentWindow: true,
				})
				if (tabs.length > 0 && tabs[0].id) {
					await chrome.tabs.sendMessage(tabs[0].id, {
						action: MESSAGE_TYPES.SHOW_TOAST,
						state: "error",
					})
				}
			} catch (toastError) {
				console.error("Failed to show error toast:", toastError)
			}

			window.close()
		} finally {
			setSaving(false)
		}
	}

	const handleAutoSearchToggle = async (enabled: boolean) => {
		try {
			await chrome.storage.local.set({
				[STORAGE_KEYS.AUTO_SEARCH_ENABLED]: enabled,
			})
			setAutoSearchEnabled(enabled)
		} catch (error) {
			console.error("Error updating auto search setting:", error)
		}
	}

	const handleSavePageButtonToggle = async (enabled: boolean) => {
		try {
			await chrome.storage.local.set({
				[STORAGE_KEYS.SAVE_PAGE_BUTTON_ENABLED]: enabled,
			})
			setSavePageButtonEnabled(enabled)
		} catch (error) {
			console.error("Error updating save page button setting:", error)
		}
	}

	const handleSignOut = async () => {
		try {
			await chrome.storage.local.remove([STORAGE_KEYS.BEARER_TOKEN])
			await chrome.storage.local.remove([STORAGE_KEYS.USER_DATA])
			await chrome.storage.local.remove([STORAGE_KEYS.DEFAULT_PROJECT])
			setUserSignedIn(false)
			queryClient.clear()
		} catch (error) {
			console.error("Error signing out:", error)
		}
	}

	/** Resolve project name from current URL domain */
	const getProjectDisplayName = (): string => {
		const tag = getContainerTagForUrl(currentUrl)
		const matched = projects.find((p) => p.containerTag === tag)
		return matched?.name ?? CONTAINER_TAG_LABELS[tag] ?? "Digitalmemory"
	}

	if (loading) {
		return (
			<div className="w-80 bg-black font-[Space_Grotesk,-apple-system,BlinkMacSystemFont,Segoe_UI,Roboto,sans-serif]">
				<div className="flex items-center justify-center py-5 border-b border-white/10">
					<img alt="Kortix" src="/icon.svg" className="h-8" />
				</div>
				<div className="flex items-center justify-center py-12">
					<div className="w-5 h-5 border-2 border-white/20 border-t-white/70 rounded-full animate-spin" />
				</div>
			</div>
		)
	}

	return (
		<div className="w-80 bg-black font-[Space_Grotesk,-apple-system,BlinkMacSystemFont,Segoe_UI,Roboto,sans-serif]">
			{/* Header */}
			<div className="flex items-center justify-center py-5 border-b border-white/10 relative">
				<img alt="Kortix" src="/icon.svg" className="h-8" />
				{userSignedIn && (
					<button
						className="absolute right-3 bg-transparent border-none text-white/40 p-1.5 rounded-lg cursor-pointer transition-all duration-200 hover:text-white hover:bg-white/10"
						onClick={handleSignOut}
						title="Sign out"
						type="button"
					>
						<svg
							fill="none"
							height="16"
							stroke="currentColor"
							strokeLinecap="round"
							strokeLinejoin="round"
							strokeWidth="2"
							viewBox="0 0 24 24"
							width="16"
						>
							<title>Logout</title>
							<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
							<polyline points="16,17 21,12 16,7" />
							<line x1="21" x2="9" y1="12" y2="12" />
						</svg>
					</button>
				)}
			</div>

			{/* Content */}
			<div className="p-4">
				{userSignedIn ? (
					<div className="text-left">
						{/* Tab Navigation */}
						<div className="flex bg-white/5 rounded-lg p-1 mb-4">
							{(["save", "imports", "settings"] as const).map((tab) => (
								<button
									key={tab}
									className={`flex-1 py-1.5 px-3 border-none rounded-md text-sm font-medium cursor-pointer transition-all duration-200 outline-none appearance-none ${
										activeTab === tab
											? "bg-white/15 text-white shadow-sm"
											: "bg-transparent text-white/40 hover:text-white/70"
									}`}
									onClick={() => setActiveTab(tab)}
									type="button"
								>
									{tab.charAt(0).toUpperCase() + tab.slice(1)}
								</button>
							))}
						</div>

						{/* Tab Content */}
						{activeTab === "save" ? (
							<div className="flex flex-col gap-3 min-h-[200px]">
								{/* Current Page Info */}
								<div className="bg-white/5 p-3.5 rounded-xl border border-white/10">
									<h3 className="m-0 mb-1 text-sm font-semibold text-white overflow-hidden text-ellipsis whitespace-nowrap leading-tight">
										{currentTitle || "Current Page"}
									</h3>
									<p className="m-0 text-xs text-white/40 overflow-hidden text-ellipsis whitespace-nowrap">
										{currentUrl}
									</p>
								</div>

								{/* Project — auto-detected from domain */}
								<div className="flex justify-between items-center py-2.5 px-3.5 bg-white/5 rounded-xl border border-white/10">
									<span className="text-xs font-medium text-white/50">
										Save to project
									</span>
									<span className="text-sm font-semibold text-white overflow-hidden text-ellipsis whitespace-nowrap max-w-[150px]">
										{getProjectDisplayName()}
									</span>
								</div>

								{/* X - GRID Button (only on Twitter/X) */}
								{isTwitterPageUrl(currentUrl) && (
									<button
										className={`w-full flex items-center justify-center gap-2 py-2.5 px-3 border rounded-xl text-sm font-medium cursor-pointer transition-all duration-200 ${
											xGridActive
												? "bg-sky-500/10 text-sky-300 border-sky-500/30 hover:bg-sky-500/15"
												: "bg-white/5 text-white/70 border-white/10 hover:bg-white/10 hover:text-white"
										}`}
										disabled={xGridLoading}
										onClick={async () => {
											setXGridLoading(true)
											try {
												const tabs = await chrome.tabs.query({
													active: true,
													currentWindow: true,
												})
												if (tabs.length > 0 && tabs[0].id) {
													const response = await chrome.tabs.sendMessage(
														tabs[0].id,
														{
															action: MESSAGE_TYPES.TOGGLE_X_GRID,
														},
													)
													setXGridActive(Boolean(response?.active))
												}
											} catch (error) {
												console.error("Failed to toggle X Grid:", error)
											} finally {
												setXGridLoading(false)
											}
										}}
										type="button"
									>
										<svg
											fill="currentColor"
											height="14"
											viewBox="0 0 24 24"
											width="14"
										>
											<title>Grid</title>
											<path d="M3 3h7v7H3V3zm0 11h7v7H3v-7zm11-11h7v7h-7V3zm0 11h7v7h-7v-7z" />
										</svg>
										{xGridLoading
											? "Loading..."
											: xGridActive
												? "X Grid ON"
												: "X Grid OFF"}
									</button>
								)}

								{/* Save Button */}
								<div className="mt-auto pt-3">
									<button
										className="w-full py-2.5 px-6 bg-white text-black border-none rounded-lg text-sm font-semibold cursor-pointer transition-all duration-200 hover:bg-white/90 disabled:bg-white/20 disabled:text-white/40 disabled:cursor-not-allowed"
										disabled={saving}
										onClick={handleSaveCurrentPage}
										type="button"
									>
										{saving ? "Saving..." : "Save Current Page"}
									</button>
								</div>
							</div>
						) : activeTab === "imports" ? (
							<div className="flex flex-col gap-3 min-h-[200px]">
								<button
									className="w-full py-3 px-3.5 bg-white/5 text-white border border-white/10 rounded-xl text-sm font-medium cursor-pointer flex items-center gap-3 transition-all duration-200 hover:bg-white/10 hover:border-white/15"
									onClick={() => {
										chrome.tabs.create({
											url: "https://chatgpt.com/#settings/Personalization",
										})
									}}
									type="button"
								>
									<svg
										aria-label="ChatGPT Logo"
										className="w-5 h-5 flex-shrink-0 text-white/60"
										fill="currentColor"
										role="img"
										viewBox="0 0 24 24"
										xmlns="http://www.w3.org/2000/svg"
									>
										<title>OpenAI</title>
										<path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z" />
									</svg>
									<div className="text-left">
										<p className="m-0 text-sm text-white leading-tight">
											Import ChatGPT Memories
										</p>
										<p className="m-0 mt-0.5 text-[11px] text-white/40 leading-tight">
											Open settings, save your memories to Kortix
										</p>
									</div>
								</button>

								<button
									className="w-full py-3 px-3.5 bg-white/5 text-white border border-white/10 rounded-xl text-sm font-medium cursor-pointer flex items-center gap-3 transition-all duration-200 hover:bg-white/10 hover:border-white/15"
									onClick={async () => {
										const [tab] = await chrome.tabs.query({
											active: true,
											currentWindow: true,
										})

										const targetUrl = "https://x.com/i/bookmarks"

										if (tab?.url === targetUrl) {
											return
										}

										await chrome.tabs.create({
											url: targetUrl,
										})
									}}
									type="button"
								>
									<svg
										aria-label="X Twitter Logo"
										className="w-5 h-5 flex-shrink-0 text-white/60"
										fill="currentColor"
										viewBox="0 0 24 24"
										xmlns="http://www.w3.org/2000/svg"
									>
										<title>X Twitter Logo</title>
										<path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
									</svg>
									<div className="text-left">
										<p className="m-0 text-sm text-white leading-tight">
											Import X/Twitter Bookmarks
										</p>
										<p className="m-0 mt-0.5 text-[11px] text-white/40 leading-tight">
											Click Kortix button on bookmarks page to import
										</p>
									</div>
								</button>
							</div>
						) : (
							<div className="flex flex-col gap-4 min-h-[200px]">
								{/* Account Section */}
								<div>
									<h3 className="text-xs font-medium text-white/50 uppercase tracking-wider mb-2">
										Account
									</h3>
									<div className="p-3.5 bg-white/5 rounded-xl border border-white/10">
										{loadingUserData ? (
											<div className="text-sm text-white/40">Loading...</div>
										) : userData?.email ? (
											<div className="flex justify-between items-center">
												<span className="text-xs font-medium text-white/50">
													Email
												</span>
												<span className="text-sm text-white/80">
													{userData.email}
												</span>
											</div>
										) : (
											<div className="text-sm text-white/40">
												No email found
											</div>
										)}
									</div>
								</div>

								{/* Overlay Section */}
								<div>
									<h3 className="text-xs font-medium text-white/50 uppercase tracking-wider mb-2">
										Overlay
									</h3>
									<div className="p-3.5 bg-white/5 rounded-xl border border-white/10">
										<div className="flex items-center justify-between gap-3">
											<div className="flex flex-col flex-1 min-w-0">
												<span className="text-sm font-medium text-white leading-tight">
													Save Page Button
												</span>
												<span className="text-[11px] text-white/40 leading-tight mt-1">
													Show a floating button on all pages to quickly save
													the current page
												</span>
											</div>
											<label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
												<input
													checked={savePageButtonEnabled}
													className="sr-only peer"
													onChange={(e) =>
														handleSavePageButtonToggle(e.target.checked)
													}
													type="checkbox"
												/>
												<div className="w-10 h-[22px] bg-white/10 rounded-full peer peer-checked:after:translate-x-[18px] after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white/40 after:rounded-full after:h-[18px] after:w-[18px] after:transition-all peer-checked:bg-white peer-checked:after:bg-black" />
											</label>
										</div>
									</div>
								</div>

								{/* Chat Integration Section */}
								<div>
									<h3 className="text-xs font-medium text-white/50 uppercase tracking-wider mb-2">
										Chat Integration
									</h3>
									<div className="p-3.5 bg-white/5 rounded-xl border border-white/10">
										<div className="flex items-center justify-between gap-3">
											<div className="flex flex-col flex-1 min-w-0">
												<span className="text-sm font-medium text-white leading-tight">
													Auto Search Memories
												</span>
												<span className="text-[11px] text-white/40 leading-tight mt-1">
													Search your memories while typing in ChatGPT, Claude,
													and T3.chat
												</span>
											</div>
											<label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
												<input
													checked={autoSearchEnabled}
													className="sr-only peer"
													onChange={(e) =>
														handleAutoSearchToggle(e.target.checked)
													}
													type="checkbox"
												/>
												<div className="w-10 h-[22px] bg-white/10 rounded-full peer peer-checked:after:translate-x-[18px] after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white/40 after:rounded-full after:h-[18px] after:w-[18px] after:transition-all peer-checked:bg-white peer-checked:after:bg-black" />
											</label>
										</div>
									</div>
								</div>
							</div>
						)}
					</div>
				) : (
					<div className="py-2">
						{authInvalidated ? (
							<div className="mb-6">
								<div className="p-3.5 bg-red-500/10 border border-red-500/20 rounded-xl">
									<h2 className="m-0 mb-1.5 text-sm font-semibold text-red-400 leading-tight">
										Session Expired
									</h2>
									<p className="m-0 text-xs text-red-400/70 leading-relaxed">
										Your authentication was invalidated. Please sign in again.
									</p>
								</div>
							</div>
						) : (
							<div className="mb-6">
								<p className="m-0 mb-5 text-sm text-white/60 text-center leading-relaxed">
									Sign in to unlock all extension features
								</p>

								<div className="flex flex-col gap-2.5">
									<div className="flex items-center gap-3 py-2 px-3 rounded-lg">
										<div className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center flex-shrink-0">
											<svg
												fill="none"
												height="16"
												stroke="currentColor"
												strokeLinecap="round"
												strokeLinejoin="round"
												strokeWidth="2"
												viewBox="0 0 24 24"
												width="16"
												className="text-white/60"
											>
												<title>Save</title>
												<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
												<polyline points="17 21 17 13 7 13 7 21" />
												<polyline points="7 3 7 8 15 8" />
											</svg>
										</div>
										<span className="text-sm text-white/80">
											Save any page to your Kortix
										</span>
									</div>
									<div className="flex items-center gap-3 py-2 px-3 rounded-lg">
										<div className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center flex-shrink-0">
											<svg
												fill="currentColor"
												viewBox="0 0 24 24"
												width="16"
												height="16"
												className="text-white/60"
											>
												<title>X</title>
												<path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
											</svg>
										</div>
										<span className="text-sm text-white/80">
											Import Twitter / X Bookmarks
										</span>
									</div>
									<div className="flex items-center gap-3 py-2 px-3 rounded-lg">
										<div className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center flex-shrink-0">
											<svg
												fill="currentColor"
												viewBox="0 0 24 24"
												width="16"
												height="16"
												className="text-white/60"
											>
												<title>ChatGPT</title>
												<path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z" />
											</svg>
										</div>
										<span className="text-sm text-white/80">
											Import your ChatGPT Memories
										</span>
									</div>
								</div>
							</div>
						)}

						<div className="pt-2">
							<button
								className="w-full py-2.5 px-6 bg-white text-black border-none rounded-lg text-sm font-semibold cursor-pointer transition-all duration-200 hover:bg-white/90"
								onClick={() => {
									const baseUrl = API_ENDPOINTS.KORTIX_WEB
									const loginUrl = new URL("/login", baseUrl)
									loginUrl.searchParams.set("extension-auth-success", "1")
									chrome.tabs.create({ url: loginUrl.toString() })
								}}
								type="button"
							>
								Sign in or create account
							</button>
							<p className="m-0 mt-3 text-center text-xs text-white/30">
								Having trouble?{" "}
								<button
									className="bg-transparent border-none text-white/50 cursor-pointer underline text-xs p-0 hover:text-white/70"
									onClick={() => {
										window.open("mailto:support@kortix.ai", "_blank")
									}}
									type="button"
								>
									Contact us
								</button>
							</p>
						</div>
					</div>
				)}
			</div>
		</div>
	)
}

export default App
