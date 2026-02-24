import { API_ENDPOINTS } from "../../utils/constants"

function Welcome() {
	return (
		<div className="min-h-screen font-[Space_Grotesk,-apple-system,BlinkMacSystemFont,Segoe_UI,Roboto,sans-serif] flex items-center justify-center p-8 bg-black">
			<div className="max-w-4xl w-full text-center">
				{/* Header */}
				<div className="mb-12">
					<img
						alt="Kortix"
						className="h-16 mb-6 mx-auto"
						src="/icon.svg"
						style={{ objectFit: "contain" }}
					/>
					<p className="text-neutral-400 text-lg font-normal max-w-2xl mx-auto">
						Your AI second brain for saving and organizing everything that
						matters. Kortix learns and remembers everything you save, your
						preferences, and understands you.
					</p>
				</div>

				{/* Features Section */}
				<div className="mb-12">
					<h2 className="text-2xl font-semibold text-white mb-8">
						What can you do with Kortix?
					</h2>

					<div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
						<div className="bg-neutral-900 border border-white/10 rounded-xl p-6 text-center transition-all duration-200 hover:-translate-y-0.5 hover:border-white/20">
							<div className="text-3xl mb-4 block">💾</div>
							<h3 className="text-lg font-semibold text-white mb-3">
								Save Any Page
							</h3>
							<p className="text-sm text-neutral-400 leading-snug">
								Instantly save web pages, articles, and content to your personal
								knowledge base
							</p>
						</div>

						<div className="bg-neutral-900 border border-white/10 rounded-xl p-6 text-center transition-all duration-200 hover:-translate-y-0.5 hover:border-white/20">
							<div className="text-3xl mb-4 block">🐦</div>
							<h3 className="text-lg font-semibold text-white mb-3">
								Import Twitter/X Bookmarks
							</h3>
							<p className="text-sm text-neutral-400 leading-snug">
								Bring all your saved tweets and bookmarks into one organized
								place
							</p>
						</div>

						<div className="bg-neutral-900 border border-white/10 rounded-xl p-6 text-center transition-all duration-200 hover:-translate-y-0.5 hover:border-white/20">
							<div className="text-3xl mb-4 block">🤖</div>
							<h3 className="text-lg font-semibold text-white mb-3">
								Import ChatGPT Memories
							</h3>
							<p className="text-sm text-neutral-400 leading-snug">
								Keep your important AI conversations and insights accessible
							</p>
						</div>

						<div className="bg-neutral-900 border border-white/10 rounded-xl p-6 text-center transition-all duration-200 hover:-translate-y-0.5 hover:border-white/20">
							<div className="text-3xl mb-4 block">🔍</div>
							<h3 className="text-lg font-semibold text-white mb-3">
								Your context, everywhere.
							</h3>
							<p className="text-sm text-neutral-400 leading-snug">
								You can connect chatbots with MCP, chat with your personal
								assistant, and more.
							</p>
						</div>
					</div>
				</div>

				{/* Actions */}
				<div className="mb-8">
					<button
						className="min-w-[200px] px-8 py-4 bg-white text-black border-none rounded-3xl text-base font-semibold cursor-pointer transition-colors duration-200 mb-4 outline-none hover:bg-neutral-200 disabled:bg-neutral-600 disabled:cursor-not-allowed"
						onClick={() => {
							const baseUrl = API_ENDPOINTS.KORTIX_WEB
							const loginUrl = new URL("/login", baseUrl)
							loginUrl.searchParams.set("extension-auth-success", "1")
							chrome.tabs.create({ url: loginUrl.toString() })
						}}
						type="button"
					>
						Login to Get started
					</button>
				</div>

				{/* Footer */}
				<div className="border-t border-white/10 pt-6 mt-8">
					<p className="text-sm text-neutral-400">
						Learn more at{" "}
						<a
							className="text-neutral-300 no-underline hover:underline hover:text-white"
							href={API_ENDPOINTS.KORTIX_WEB}
							rel="noopener noreferrer"
							target="_blank"
						>
							{new URL(API_ENDPOINTS.KORTIX_WEB).hostname}
						</a>
					</p>
				</div>
			</div>
		</div>
	)
}

export default Welcome
