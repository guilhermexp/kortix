/**
 * Configuração para testes automatizados
 */

export const config = {
	// URL da API (ajuste se necessário)
	apiUrl: process.env.API_URL || "http://localhost:4000",

	// Credenciais de teste (ajuste com credenciais válidas)
	auth: {
		email: process.env.TEST_USER_EMAIL || "test@example.com",
		password: process.env.TEST_USER_PASSWORD || "test123",
	},

	// Timeout para requisições (ms)
	timeout: 30000,

	// Configurações de teste
	test: {
		// Criar documentos reais durante os testes?
		createRealDocuments: true,

		// Limpar documentos após testes?
		cleanupAfterTests: false,

		// Verbose logging?
		verbose: true,
	},

	// Supabase (para testes diretos no banco)
	supabase: {
		url: process.env.SUPABASE_URL || "",
		serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY || "",
	},
}

// Helper para logs
export function log(message: string, data?: unknown) {
	if (config.test.verbose) {
		console.log(`[TEST] ${message}`)
		if (data) {
			console.log(JSON.stringify(data, null, 2))
		}
	}
}

// Helper para erros
export function logError(message: string, error?: unknown) {
	console.error(`[ERROR] ${message}`)
	if (error) {
		console.error(error)
	}
}

// Helper para sucesso
export function logSuccess(message: string) {
	console.log(`✅ ${message}`)
}

// Helper para falha
export function logFailure(message: string) {
	console.error(`❌ ${message}`)
}
