import { API_ENDPOINTS } from "../../utils/constants"

function Welcome() {
	return (
		<div className="min-h-screen font-[Space_Grotesk,-apple-system,BlinkMacSystemFont,Segoe_UI,Roboto,sans-serif] flex items-center justify-center bg-black">
			<div className="max-w-md w-full px-8">
				{/* Logo + Brand */}
				<div className="flex items-center gap-3 mb-12">
					<img
						alt="Kortix"
						className="h-7"
						src="/icon.svg"
						style={{ objectFit: "contain" }}
					/>
					<span className="text-lg font-semibold text-white">Kortix</span>
				</div>

				{/* Headline */}
				<h1 className="text-2xl font-semibold text-white mb-3 leading-tight">
					Sua memória, acessível e privada.
				</h1>
				<p className="text-sm text-neutral-500 mb-12 leading-snug">
					Salve páginas, artigos e vídeos com um clique. Importe bookmarks do
					Twitter e memórias do ChatGPT. Acesse seu contexto em qualquer lugar.
				</p>

				{/* CTA */}
				<button
					className="w-full py-3 bg-white text-black border-none rounded-lg text-sm font-semibold cursor-pointer transition-colors duration-200 outline-none hover:bg-neutral-200"
					onClick={() => {
						const baseUrl = API_ENDPOINTS.KORTIX_WEB
						const loginUrl = new URL("/login", baseUrl)
						loginUrl.searchParams.set("extension-auth-success", "1")
						chrome.tabs.create({ url: loginUrl.toString() })
					}}
					type="button"
				>
					Entrar ou criar conta
				</button>

				{/* Footer */}
				<p className="text-xs text-neutral-600 mt-6 text-center">
					<a
						className="text-neutral-500 no-underline hover:text-neutral-300"
						href={API_ENDPOINTS.KORTIX_WEB}
						rel="noopener noreferrer"
						target="_blank"
					>
						{new URL(API_ENDPOINTS.KORTIX_WEB).hostname}
					</a>
				</p>
			</div>
		</div>
	)
}

export default Welcome
