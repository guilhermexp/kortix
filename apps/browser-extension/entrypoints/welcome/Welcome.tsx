import { API_ENDPOINTS } from "../../utils/constants"

function Welcome() {
	return (
		<div className="min-h-screen font-[Space_Grotesk,-apple-system,BlinkMacSystemFont,Segoe_UI,Roboto,sans-serif] flex items-center justify-center p-8 bg-gradient-to-br from-gray-50 to-white">
			<div className="max-w-4xl w-full text-center">
				{/* Header */}
				<div className="mb-12">
					<img
						alt="supermemory"
						className="h-16 mb-6 mx-auto"
						src="/icon-128.png"
						style={{ objectFit: "contain" }}
					/>
					<p className="text-gray-600 text-lg font-normal max-w-2xl mx-auto">
						Your AI second brain for saving and organizing everything that
						matters. Supermemory learns and remembers everything you save, your
						preferences, and understands you.
					</p>
				</div>

				{/* Features Section */}
				<div className="mb-12">
					<h2 className="text-2xl font-semibold text-black mb-8">
						What can you do with supermemory ?
					</h2>

					<div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
						<div className="bg-white border border-gray-200 rounded-xl p-6 text-center transition-all duration-200 shadow-sm hover:-translate-y-0.5 hover:shadow-md hover:border-gray-300">
							<div className="text-3xl mb-4 block">💾</div>
							<h3 className="text-lg font-semibold text-black mb-3">
								Save Any Page
							</h3>
							<p className="text-sm text-gray-600 leading-snug">
								Instantly save web pages, articles, and content to your personal
								knowledge base
							</p>
						</div>

						<div className="bg-white border border-gray-200 rounded-xl p-6 text-center transition-all duration-200 shadow-sm hover:-translate-y-0.5 hover:shadow-md hover:border-gray-300">
							<div className="text-3xl mb-4 block">🐦</div>
							<h3 className="text-lg font-semibold text-black mb-3">
								Import Twitter/X Bookmarks
							</h3>
							<p className="text-sm text-gray-600 leading-snug">
								Bring all your saved tweets and bookmarks into one organized
								place
							</p>
						</div>

						<div className="bg-white border border-gray-200 rounded-xl p-6 text-center transition-all duration-200 shadow-sm hover:-translate-y-0.5 hover:shadow-md hover:border-gray-300">
							<div className="text-3xl mb-4 block">🤖</div>
							<h3 className="text-lg font-semibold text-black mb-3">
								Import ChatGPT Memories
							</h3>
							<p className="text-sm text-gray-600 leading-snug">
								Keep your important AI conversations and insights accessible
							</p>
						</div>

						<div className="bg-white border border-gray-200 rounded-xl p-6 text-center transition-all duration-200 shadow-sm hover:-translate-y-0.5 hover:shadow-md hover:border-gray-300">
							<div className="text-3xl mb-4 block">🔍</div>
							<h3 className="text-lg font-semibold text-black mb-3">
								Your context, everywhere.
							</h3>
							<p className="text-sm text-gray-600 leading-snug">
								You can connect chatbots with MCP, chat with your personal
								assistant, and more.
							</p>
						</div>
					</div>
				</div>

				{/* Actions */}
				<div className="mb-8">
					<button
						className="min-w-[200px] px-8 py-4 bg-gray-700 text-white border-none rounded-3xl text-base font-semibold cursor-pointer transition-colors duration-200 mb-4 outline-none hover:bg-gray-800 disabled:bg-gray-400 disabled:cursor-not-allowed"
						onClick={() => {
							const baseUrl = API_ENDPOINTS.SUPERMEMORY_WEB
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
				<div className="border-t border-gray-200 pt-6 mt-8">
					<p className="text-sm text-gray-600">
						Learn more at{" "}
						<a
							className="text-blue-500 no-underline hover:underline hover:text-blue-700"
							href={API_ENDPOINTS.SUPERMEMORY_WEB}
							rel="noopener noreferrer"
							target="_blank"
						>
							{new URL(API_ENDPOINTS.SUPERMEMORY_WEB).hostname}
						</a>
					</p>
				</div>
			</div>
		</div>
	)
}

export default Welcome
