import { readFileSync } from "node:fs"
import { performance } from "node:perf_hooks"
import { config as loadEnv } from "dotenv"

loadEnv({ path: ".env.local" })
loadEnv()

const ensureEnv = (key: string, fallback: string) => {
	if (!process.env[key] || process.env[key]?.length === 0) {
		process.env[key] = fallback
	}
}

ensureEnv("SUPABASE_URL", "https://example.supabase.co")
ensureEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-placeholder")
ensureEnv("SUPABASE_ANON_KEY", "anon-placeholder")
ensureEnv("ANTHROPIC_API_KEY", "anthropic-placeholder")
ensureEnv("APP_URL", "http://localhost:3000")
ensureEnv("RESEND_FROM_EMAIL", "noreply@example.com")

const DEEPWIKI_SSE_URL = new URL("https://mcp.deepwiki.com/sse")
const DEEPWIKI_RPC_URL = "https://mcp.deepwiki.com/mcp"

const CLAUDE_AGENT_FILE = "apps/api/src/services/claude-agent.ts"
const REQUIRED_TOOLS = [
	"get_file_tree",
	"read_file",
	"search_code",
	"ask_question",
	"get_folder_structure",
] as const

type RequiredTool = (typeof REQUIRED_TOOLS)[number]

async function verifyConfigPresence() {
	const source = readFileSync(CLAUDE_AGENT_FILE, "utf8")
	const hasDeepwiki =
		source.includes("deepwiki:") && source.includes(DEEPWIKI_RPC_URL)
	if (!hasDeepwiki) {
		throw new Error(
			`Configuração DeepWiki não encontrada em ${CLAUDE_AGENT_FILE}`,
		)
	}
	console.log(`[config] DeepWiki encontrado em ${CLAUDE_AGENT_FILE}`)
}

async function testHttpConnectivity() {
	const start = performance.now()
	const response = await fetch(DEEPWIKI_RPC_URL, {
		method: "OPTIONS",
		headers: {
			Accept: "application/json, text/event-stream",
			"mcp-protocol-version": "2024-11-05",
		},
	})
	const elapsed = performance.now() - start
	console.log(
		`[connectivity] OPTIONS ${DEEPWIKI_RPC_URL} → ${response.status} (${elapsed.toFixed(0)}ms)`,
	)
	if (!response.ok) {
		const body = await response.text().catch(() => "")
		throw new Error(
			`Falha na verificação HTTP: status ${response.status} ${body}`,
		)
	}
}

async function connectAndInspectTools() {
	const { Client } = await import("@modelcontextprotocol/sdk/client/index.js")
	const { SSEClientTransport } = await import(
		"@modelcontextprotocol/sdk/client/sse.js"
	)
	const { LATEST_PROTOCOL_VERSION } = await import(
		"@modelcontextprotocol/sdk/types.js"
	)

	const transport = new SSEClientTransport(DEEPWIKI_SSE_URL, {
		eventSourceInit: {
			headers: {
				"mcp-protocol-version": LATEST_PROTOCOL_VERSION,
			},
		},
		requestInit: {
			headers: {
				"mcp-protocol-version": LATEST_PROTOCOL_VERSION,
			},
		},
	})

	const client = new Client(
		{
			name: "supermemory-deepwiki-tester",
			version: "0.1.0",
		},
		{
			capabilities: {
				tools: {},
			},
		},
	)

	const start = performance.now()
	await client.connect(transport)
	const connectElapsed = performance.now() - start
	console.log(
		`[mcp] Conexão estabelecida em ${connectElapsed.toFixed(0)}ms (protocolo ${LATEST_PROTOCOL_VERSION})`,
	)

	try {
		const toolListStart = performance.now()
		const toolsResult = await client.listTools({})
		const toolElapsed = performance.now() - toolListStart
		console.log(
			`[mcp] ${toolsResult.tools.length} ferramentas disponíveis (${toolElapsed.toFixed(0)}ms)`,
		)

		const availableToolNames = toolsResult.tools.map((tool) => tool.name)
		console.log(
			`[mcp] Ferramentas retornadas: ${availableToolNames.join(", ") || "nenhuma"}`,
		)

		const missingTools = REQUIRED_TOOLS.filter(
			(tool) => !availableToolNames.includes(tool),
		)
		if (missingTools.length > 0) {
			console.error(
				`[mcp] Atenção: ferramentas ausentes → ${missingTools.join(", ")}`,
			)
		} else {
			console.log(`[mcp] Ferramentas verificadas: ${REQUIRED_TOOLS.join(", ")}`)
		}

		let treeToolName: string | undefined
		if (availableToolNames.includes("get_file_tree")) {
			treeToolName = "get_file_tree"
		} else if (availableToolNames.includes("read_wiki_structure")) {
			treeToolName = "read_wiki_structure"
		}

		let schemaJson: string | null = null
		if (treeToolName) {
			const treeTool = toolsResult.tools.find(
				(tool) => tool.name === treeToolName,
			)
			schemaJson = JSON.stringify(treeTool?.inputSchema, null, 2)
			console.log(`[mcp] Schema ${treeToolName}:\n${schemaJson}`)
		} else {
			console.error(
				"[mcp] Nenhuma ferramenta de árvore de arquivos encontrada (get_file_tree/read_wiki_structure).",
			)
		}

		let callResult: unknown = null
		let callError: string | null = null
		if (treeToolName) {
			try {
				const callStart = performance.now()
				const repoUrl = "https://github.com/anthropics/anthropic-sdk-typescript"
				const args =
					treeToolName === "get_file_tree"
						? { repo_url: repoUrl }
						: { repoName: "anthropics/anthropic-sdk-typescript" }
				callResult = await client.callTool({
					name: treeToolName,
					arguments: args,
				})
				const callElapsed = performance.now() - callStart
				console.log(
					`[mcp] ${treeToolName}(${repoUrl}) -> ${callElapsed.toFixed(0)}ms`,
				)
				console.log(JSON.stringify(callResult, null, 2))
			} catch (error) {
				callError = error instanceof Error ? error.message : String(error)
				console.error(`[mcp] Falha ao executar ${treeToolName}: ${callError}`)
			}
		}

		return {
			availableToolNames,
			missingTools,
			treeToolName,
			schemaJson,
			callResult,
			callError,
		}
	} finally {
		await client.close()
		await transport.close()
	}
}

async function main() {
	try {
		await verifyConfigPresence()
		await testHttpConnectivity()
		const result = await connectAndInspectTools()
		const hasAllTools = result.missingTools.length === 0
		const treeCallSucceeded = Boolean(
			result.treeToolName && !result.callError && result.callResult,
		)

		if (!hasAllTools) {
			process.exitCode = 1
		}
		if (result.treeToolName && result.callError) {
			process.exitCode = 1
		}

		if (hasAllTools && treeCallSucceeded) {
			console.log("[done] Testes DeepWiki MCP concluídos com sucesso.")
		} else {
			console.warn("[done] Testes concluídos com pendências (ver logs acima).")
		}
	} catch (error) {
		console.error("[error] Falha durante validação DeepWiki MCP:", error)
		process.exitCode = 1
	}
}

void main()
