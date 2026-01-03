import type { GenerateContentRequest } from "@google/generative-ai"
import { env } from "../env"
import { safeFetch } from "../security/url-validator"
import {
	getCodeContextWithExa,
	getContentsWithExa,
	searchWebWithExa,
} from "./exa-search"
import { getGoogleModel } from "./google-genai"

type PreviewMetadata = {
	title?: string | null
	description?: string | null
	ogImage?: string | null
	twitterImage?: string | null
	favicon?: string | null
	siteName?: string | null
}

async function extractPreviewMetadata(url: string): Promise<PreviewMetadata> {
	try {
		const response = await safeFetch(url, {
			headers: {
				"User-Agent":
					"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
			},
		})

		if (!response.ok) {
			return {}
		}

		const html = await response.text()
		const metadata: PreviewMetadata = {}

		// Extract title
		const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i)
		if (titleMatch?.[1]) {
			metadata.title = titleMatch[1].trim()
		}

		// Extract meta description
		const descMatch = html.match(
			/<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i,
		)
		if (descMatch?.[1]) {
			metadata.description = descMatch[1].trim()
		}

		// Extract og:image
		const ogImageMatch = html.match(
			/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i,
		)
		if (ogImageMatch?.[1]) {
			metadata.ogImage = ogImageMatch[1].trim()
		}

		// Extract twitter:image
		const twitterImageMatch = html.match(
			/<meta\s+name=["']twitter:image["']\s+content=["']([^"']+)["']/i,
		)
		if (twitterImageMatch?.[1]) {
			metadata.twitterImage = twitterImageMatch[1].trim()
		}

		// Extract favicon
		const faviconMatch = html.match(
			/<link\s+rel=["'](icon|shortcut icon)["']\s+href=["']([^"']+)["']/i,
		)
		if (faviconMatch?.[2]) {
			metadata.favicon = faviconMatch[2].trim()
		}

		// Extract site name
		const siteNameMatch = html.match(
			/<meta\s+property=["']og:site_name["']\s+content=["']([^"']+)["']/i,
		)
		if (siteNameMatch?.[1]) {
			metadata.siteName = siteNameMatch[1].trim()
		}

		// Convert relative URLs to absolute
		const baseUrl = new URL(url)
		const makeAbsolute = (
			relativeUrl: string | null | undefined,
		): string | null => {
			if (!relativeUrl) return null
			if (
				relativeUrl.startsWith("http://") ||
				relativeUrl.startsWith("https://")
			) {
				return relativeUrl
			}
			try {
				return new URL(relativeUrl, baseUrl).toString()
			} catch {
				return null
			}
		}

		metadata.ogImage = makeAbsolute(metadata.ogImage)
		metadata.twitterImage = makeAbsolute(metadata.twitterImage)
		metadata.favicon = makeAbsolute(metadata.favicon)

		return metadata
	} catch (error) {
		console.warn("Failed to extract preview metadata:", error)
		return {}
	}
}

export class AnalysisService {
	private modelId: string
	private defaultUseExa: boolean

	constructor(modelId = "gemini-2.0-flash", useExa?: boolean) {
		this.modelId = modelId
		this.defaultUseExa =
			typeof useExa === "boolean" ? useExa : Boolean(env.EXA_API_KEY)
	}

	async analyzeYouTubeUrl(url: string, title?: string) {
		if (!env.GOOGLE_API_KEY) {
			throw new Error("GOOGLE_API_KEY not configured for deep analysis")
		}

		// Extract basic metadata for YouTube (thumbnail extraction)
		const videoId = this.getYouTubeId(url)
		const thumbnail = videoId
			? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`
			: null

		const provider = getGoogleModel(this.modelId)
		if (!provider) {
			throw new Error("GOOGLE_API_KEY not configured for deep analysis")
		}

		const systemInstruction = {
			parts: [
				{
					text: "Você é um assistente multimodal. Analise o vídeo do YouTube a partir da URL fornecida de forma completa, processando tanto o áudio quanto os quadros visuais. Crie um resumo detalhado para que você possa responder perguntas sobre o vídeo. Sua análise deve incluir:\n1. Conteúdo Falado: Tópicos principais, argumentos e conclusões.\n2. Análise Visual: Descrição de cenas importantes, pessoas (e suas ações ou aparências, como cor de roupa), objetos, textos na tela e o ambiente geral.\n3. Eventos Chave: Uma cronologia de eventos importantes, combinando informações visuais e de áudio, com timestamps se possível.\n\nSeja o mais detalhado possível. Este resumo será seu único conhecimento sobre o vídeo. Lembre-se, sua resposta deve ser inteiramente em português do Brasil.",
				},
			],
		} as GenerateContentRequest["systemInstruction"]

		const contents: GenerateContentRequest["contents"] = [
			{
				role: "user",
				parts: [
					{
						text: `Analise o vídeo do YouTube${
							title ? ` intitulado "${title}"` : ""
						} a partir da URL fornecida.`,
					},
					// Parte chave: instruir o modelo a buscar o vídeo via URL
					// Observação: o fallback OpenRouter ignora fileData; essa capacidade requer chave do Google
					{
						fileData: {
							mimeType: "video/mp4",
							fileUri: url,
						},
					} as any,
				],
			},
		]

		const response = await provider.generateContent({
			contents,
			systemInstruction,
			generationConfig: {
				maxOutputTokens: 8192,
				temperature: 0.3,
			},
		})

		const summary = response.response?.text?.() ?? ""
		if (!summary) {
			throw new Error("Empty analysis response from model")
		}

		return {
			summary,
			mode: "youtube" as const,
			title: title || null,
			previewMetadata: {
				ogImage: thumbnail,
				title: title || null,
			},
		}
	}

	private getYouTubeId(url: string): string | undefined {
		try {
			const parsed = new URL(url)
			if (parsed.hostname.includes("youtu.be")) {
				return parsed.pathname.replace(/^\//, "") || undefined
			}
			if (parsed.searchParams.has("v")) {
				return parsed.searchParams.get("v") ?? undefined
			}
			const pathSegments = parsed.pathname.split("/").filter(Boolean)
			if (pathSegments[0] === "embed" && pathSegments[1]) {
				return pathSegments[1]
			}
		} catch {}
		return undefined
	}

	private isYouTube(url: string) {
		return /(^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\/.+)/i.test(url)
	}

	private isGithubRepo(url: string) {
		try {
			const u = new URL(url)
			if (!u.hostname.includes("github.com")) return false
			const parts = u.pathname.split("/").filter(Boolean)
			return parts.length >= 2 // owner/repo
		} catch {
			return false
		}
	}

	async analyzeWebUrl(url: string, opts?: { useExa?: boolean }) {
		const useExa =
			typeof opts?.useExa === "boolean" ? opts.useExa : this.defaultUseExa

		// Extract preview metadata first
		const previewMetadata = await extractPreviewMetadata(url)

		// Prefer EXA contents for primary markdown
		let text = ""
		if (useExa) {
			const contents = await getContentsWithExa([url], {
				livecrawl: "preferred",
			})
			text = (contents[0]?.text || "").slice(0, 100_000)
		}
		if (!text) {
			// Fallback to basic HTTP fetch (MarkItDown disabled temporarily)
			console.log(
				"[AnalysisService] EXA empty, using HTTP fetch fallback for:",
				url,
			)
			const response = await safeFetch(url, {
				headers: {
					"User-Agent": "Mozilla/5.0 (compatible; KortixBot/1.0)",
				},
				signal: AbortSignal.timeout(30000),
			})
			if (response.ok) {
				const html = await response.text()
				// Basic text extraction from HTML
				const extractedText = html
					.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
					.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
					.replace(/<[^>]+>/g, " ")
					.replace(/&nbsp;/g, " ")
					.replace(/&amp;/g, "&")
					.replace(/&lt;/g, "<")
					.replace(/&gt;/g, ">")
					.replace(/&quot;/g, '"')
					.replace(/&#39;/g, "'")
					.replace(/\s+/g, " ")
					.trim()
				text = extractedText.slice(0, 100_000)
			}
		}

		// Crawl a few subpages via EXA search within same domain
		let exaContext = ""
		if (useExa) {
			try {
				const domain = new URL(url).hostname
				const exa = await searchWebWithExa(domain, {
					limit: 5,
					includeDomains: [domain],
				})
				const urls = exa.map((r) => r.url).filter(Boolean) as string[]
				const more = urls.length
					? await getContentsWithExa(urls.slice(0, 3), {
							livecrawl: "preferred",
						})
					: []
				const lines = exa
					.map(
						(r, i) =>
							`(${i + 1}) ${r.title || "Sem título"}\n${r.url || ""}\n${r.snippet || ""}`,
					)
					.join("\n\n")
				const moreText = more
					.map((m) => m.text || "")
					.join("\n\n")
					.slice(0, 60_000)
				exaContext = `${lines}${moreText ? `\n\nSUBPÁGINAS (EXA Markdown):\n${moreText}` : ""}`
			} catch {}
		}

		const provider = getGoogleModel(this.modelId)
		if (!provider) {
			throw new Error("GOOGLE_API_KEY not configured for deep analysis")
		}
		const systemInstruction = {
			parts: [
				{
					text: "Você é um analista técnico. Leia o conteúdo abaixo (markdown extraído de uma URL) e gere uma análise completa em português do Brasil, incluindo: 1) Resumo detalhado, 2) Tópicos principais, 3) Estrutura/Seções relevantes, 4) Instruções de uso/prática (se aplicável), 5) Pontos fortes, limitações e recomendações, 6) Q&A rápidas que o conteúdo permite responder.",
				},
			],
		}
		const contents = [
			{
				role: "user",
				parts: [
					{
						text: `URL: ${url}\n\nCONTEÚDO (markdown):\n\n${text}${exaContext}`,
					},
				],
			},
		] as GenerateContentRequest["contents"]

		const response = await provider.generateContent({
			contents,
			systemInstruction,
			generationConfig: { maxOutputTokens: 8192, temperature: 0.3 },
		})
		const summary = response.response?.text?.() ?? ""
		if (!summary) throw new Error("Empty analysis response from model")
		return {
			summary,
			mode: "web" as const,
			title: previewMetadata.title || null,
			previewMetadata,
		}
	}

	async analyzeGithubRepository(
		url: string,
		githubToken?: string,
		opts?: { useExa?: boolean },
	) {
		// Basic repo extraction: fetch README and key files via raw URLs
		const u = new URL(url)
		const [owner, repo] = u.pathname.split("/").filter(Boolean)
		if (!owner || !repo) throw new Error("Invalid GitHub repository URL")

		// Extract preview metadata
		const previewMetadata = await extractPreviewMetadata(url)

		const rawBase = `https://raw.githubusercontent.com/${owner}/${repo}/HEAD`
		async function fetchText(path: string) {
			const res = await fetch(`${rawBase}/${path}`, {
				headers: githubToken
					? { Authorization: `Bearer ${githubToken}` }
					: undefined,
			})
			if (!res.ok) return null
			return await res.text()
		}

		const [readme, pkg, pyproject, setup, requirements] = await Promise.all([
			fetchText("README.md"),
			fetchText("package.json"),
			fetchText("pyproject.toml"),
			fetchText("setup.py"),
			fetchText("requirements.txt"),
		])

		const collected = [
			readme ? `# README.md\n${readme}` : "",
			pkg ? `\n\n# package.json\n${pkg}` : "",
			pyproject ? `\n\n# pyproject.toml\n${pyproject}` : "",
			setup ? `\n\n# setup.py\n${setup}` : "",
			requirements ? `\n\n# requirements.txt\n${requirements}` : "",
		]
			.filter(Boolean)
			.join("\n\n")

		const context =
			collected ||
			`Repositório: ${owner}/${repo} (sem arquivos básicos encontrados)`
		const useExa =
			typeof opts?.useExa === "boolean" ? opts.useExa : this.defaultUseExa
		let exaContext = ""
		if (useExa) {
			try {
				// Use Exa Code Context
				const code = await getCodeContextWithExa(`${owner}/${repo}`, 7)
				const codeLines = code
					.map(
						(r, i) =>
							`(${i + 1}) ${r.title || ""}\n${r.url || ""}\n${(r.text || "").slice(0, 2000)}`,
					)
					.join("\n\n")
				const exa = await searchWebWithExa(`${owner} ${repo} GitHub`, {
					limit: 5,
				})
				const lines = exa
					.map(
						(r, i) =>
							`(${i + 1}) ${r.title || "Sem título"}\n${r.url || ""}\n${r.snippet || ""}`,
					)
					.join("\n\n")
				exaContext = [lines, codeLines].filter(Boolean).join("\n\n")
			} catch {}
		}

		const provider = getGoogleModel(this.modelId)
		if (!provider) {
			throw new Error("GOOGLE_API_KEY not configured for deep analysis")
		}
		const systemInstruction = {
			parts: [
				{
					text: "Você é um analista de repositórios. Com base no conteúdo fornecido (arquivos principais do repositório), gere uma análise completa em português do Brasil: 1) Objetivo do projeto, 2) Arquitetura e estrutura de pastas, 3) Como instalar e usar (com exemplos), 4) Dependências e requisitos, 5) Fluxos principais (ex.: build, testes, execução), 6) APIs/CLIs expostas, 7) Boas práticas e pontos de atenção, 8) Perguntas e respostas úteis.",
				},
			],
		}
		const contents = [
			{
				role: "user",
				parts: [
					{
						text: `URL: ${url}\n\nARQUIVOS:\n\n${context.slice(0, 120_000)}${exaContext}`,
					},
				],
			},
		] as GenerateContentRequest["contents"]

		const response = await provider.generateContent({
			contents,
			systemInstruction,
			generationConfig: { maxOutputTokens: 8192, temperature: 0.25 },
		})
		const summary = response.response?.text?.() ?? ""
		if (!summary) throw new Error("Empty analysis response from model")
		return {
			summary,
			mode: "repository" as const,
			title: previewMetadata.title || `${owner}/${repo}`,
			previewMetadata,
		}
	}

	async analyzeAuto(
		url: string,
		title?: string,
		githubToken?: string,
		opts?: { useExa?: boolean },
	) {
		if (this.isYouTube(url)) return this.analyzeYouTubeUrl(url, title)
		if (this.isGithubRepo(url))
			return this.analyzeGithubRepository(url, githubToken, opts)
		return this.analyzeWebUrl(url, opts)
	}
}
