import { createClient } from "@supabase/supabase-js"
import { env } from "./src/env"
import { createKortixTools } from "./src/services/claude-agent-tools"

// Mock Supabase client for testing
const mockClient = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY)

async function testToolsRegistration() {
	console.log("=".repeat(60))
	console.log("Testing MCP Tools Registration")
	console.log("=".repeat(60))

	try {
		// Create tools server
		const toolsServerConfig = createKortixTools(
			mockClient,
			"test-org-id",
			{},
		)

		console.log("\n✅ Tools server created successfully")

		// Access the MCP server instance
		const mcpServer = (toolsServerConfig as any).instance

		if (!mcpServer) {
			console.error("\n❌ No MCP server instance found!")
			process.exit(1)
		}

		// Access _registeredTools
		const registeredTools = (mcpServer as any)._registeredTools

		console.log("\n📋 Registered Tools:")
		console.log("Type:", typeof registeredTools)
		console.log("Is Array:", Array.isArray(registeredTools))

		if (Array.isArray(registeredTools)) {
			console.log(`\nTotal: ${registeredTools.length} tools\n`)

			registeredTools.forEach((tool: any, index: number) => {
				const name = tool.name || tool.toolName || "unnamed"
				const description = tool.description || "No description"

				console.log(`${index + 1}. ${name}`)
				console.log(`   Description: ${description.substring(0, 100)}...`)

				if (tool.inputSchema) {
					const schema = tool.inputSchema
					if (schema.properties) {
						const params = Object.keys(schema.properties)
						console.log(
							`   Parameters (${params.length}): ${params.join(", ")}`,
						)
					}
				}
				console.log()
			})

			// Check for searchDatabase
			const hasSearchDatabase = registeredTools.some(
				(t: any) => t.name === "searchDatabase",
			)
			console.log(`${hasSearchDatabase ? "✅" : "❌"} searchDatabase found`)

			// Check for searchWeb
			const hasSearchWeb = registeredTools.some(
				(t: any) => t.name === "searchWeb",
			)
			console.log(`${hasSearchWeb ? "✅" : "❌"} searchWeb found`)

			if (!hasSearchWeb) {
				console.log("\n❌ ERROR: searchWeb NOT registered!")
				console.log("\nAll registered tool names:")
				registeredTools.forEach((t: any) =>
					console.log(`  - ${t.name || "unnamed"}`),
				)
				process.exit(1)
			}

			// Display searchWeb details
			const searchWebTool = registeredTools.find(
				(t: any) => t.name === "searchWeb",
			)

			if (searchWebTool) {
				console.log("\n" + "=".repeat(60))
				console.log("searchWeb Tool Details:")
				console.log("=".repeat(60))
				console.log("\nDescription:")
				console.log(searchWebTool.description)

				if (searchWebTool.inputSchema?.properties) {
					console.log("\nParameters:")
					const props = searchWebTool.inputSchema.properties
					Object.keys(props).forEach((key) => {
						const prop = props[key]
						const type = prop.type || "unknown"
						const defaultVal =
							prop.default !== undefined ? ` (default: ${prop.default})` : ""
						const desc = prop.description || ""
						console.log(`  • ${key} [${type}]${defaultVal}`)
						if (desc) {
							console.log(`    ${desc}`)
						}
					})
				}
			}

			console.log("\n" + "=".repeat(60))
			console.log("✅ All tests passed! searchWeb is properly registered.")
			console.log("=".repeat(60))
		} else if (typeof registeredTools === "object") {
			console.log("Registered tools is an object (Map?):")
			console.log("Keys:", Object.keys(registeredTools))

			Object.entries(registeredTools).forEach(([key, value]: [string, any]) => {
				console.log(`\n${key}:`, value)
			})
		} else {
			console.log("❌ Unexpected format for _registeredTools")
			console.log("Value:", registeredTools)
		}
	} catch (error) {
		console.error("\n❌ Error during test:")
		console.error(error)
		process.exit(1)
	}
}

// Run test
testToolsRegistration()
