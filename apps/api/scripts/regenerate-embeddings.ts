#!/usr/bin/env bun
/**
 * Script para regenerar embeddings perdidos durante a migration
 *
 * Uso:
 *   bun run scripts/regenerate-embeddings.ts
 *
 * Flags opcionais:
 *   --batch-size=N  (default: 10)
 *   --delay-ms=N    (default: 100)
 *   --table=TABLE   (document_chunks, documents, memories, ou all)
 */

import { createClient } from "@supabase/supabase-js"
import { env } from "../src/env"
import { generateEmbedding } from "../src/services/embedding-provider"

const BATCH_SIZE = Number(process.argv.find(arg => arg.startsWith('--batch-size='))?.split('=')[1]) || 10
const DELAY_MS = Number(process.argv.find(arg => arg.startsWith('--delay-ms='))?.split('=')[1]) || 100
const TARGET_TABLE = process.argv.find(arg => arg.startsWith('--table='))?.split('=')[1] || 'all'

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

interface ChunkRow {
	id: string
	content: string
}

interface DocumentRow {
	id: string
	summary: string | null
}

interface MemoryRow {
	id: string
	content: string
}

async function delay(ms: number) {
	return new Promise(resolve => setTimeout(resolve, ms))
}

async function regenerateChunkEmbeddings() {
	console.log('\n🔄 Regenerando embeddings de document_chunks...')

	// Buscar chunks sem embedding
	const { data: chunks, error } = await supabase
		.from('document_chunks')
		.select('id, content')
		.is('embedding', null)
		.limit(5000)

	if (error) {
		console.error('❌ Erro ao buscar chunks:', error)
		return
	}

	if (!chunks || chunks.length === 0) {
		console.log('✅ Todos os chunks já têm embeddings!')
		return
	}

	console.log(`📊 Encontrados ${chunks.length} chunks sem embedding`)

	let processed = 0
	let errors = 0

	// Processar em batches
	for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
		const batch = chunks.slice(i, i + BATCH_SIZE)

		try {
			// Gerar embeddings para o batch
			const embeddings = await Promise.all(
				batch.map(async (chunk) => {
					try {
						const embedding = await generateEmbedding(chunk.content)
						return { id: chunk.id, embedding }
					} catch (err) {
						console.warn(`⚠️  Erro no chunk ${chunk.id}:`, err)
						errors++
						return null
					}
				})
			)

			// Atualizar no banco (somente os que tiveram sucesso)
			const successfulEmbeddings = embeddings.filter(e => e !== null)

			for (const item of successfulEmbeddings) {
				if (!item) continue

				const { error: updateError } = await supabase
					.from('document_chunks')
					.update({ embedding: `[${item.embedding.join(',')}]` })
					.eq('id', item.id)

				if (updateError) {
					console.error(`❌ Erro ao atualizar chunk ${item.id}:`, updateError)
					errors++
				} else {
					processed++
				}
			}

			console.log(`✓ Processado batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(chunks.length / BATCH_SIZE)} (${processed}/${chunks.length})`)

			// Delay para respeitar rate limits
			if (i + BATCH_SIZE < chunks.length) {
				await delay(DELAY_MS)
			}
		} catch (err) {
			console.error('❌ Erro ao processar batch:', err)
			errors += batch.length
		}
	}

	console.log(`\n✅ Chunks concluídos: ${processed} processados, ${errors} erros`)
}

async function regenerateDocumentEmbeddings() {
	console.log('\n🔄 Regenerando embeddings de documents...')

	// Buscar documentos sem embedding
	const { data: docs, error } = await supabase
		.from('documents')
		.select('id, summary')
		.is('summary_embedding', null)
		.not('summary', 'is', null)
		.limit(1000)

	if (error) {
		console.error('❌ Erro ao buscar documentos:', error)
		return
	}

	if (!docs || docs.length === 0) {
		console.log('✅ Todos os documentos já têm embeddings!')
		return
	}

	console.log(`📊 Encontrados ${docs.length} documentos sem embedding`)

	let processed = 0
	let errors = 0

	// Processar em batches
	for (let i = 0; i < docs.length; i += BATCH_SIZE) {
		const batch = docs.slice(i, i + BATCH_SIZE)

		try {
			const embeddings = await Promise.all(
				batch.map(async (doc) => {
					if (!doc.summary) return null

					try {
						const embedding = await generateEmbedding(doc.summary)
						return { id: doc.id, embedding }
					} catch (err) {
						console.warn(`⚠️  Erro no documento ${doc.id}:`, err)
						errors++
						return null
					}
				})
			)

			const successfulEmbeddings = embeddings.filter(e => e !== null)

			for (const item of successfulEmbeddings) {
				if (!item) continue

				const { error: updateError } = await supabase
					.from('documents')
					.update({ summary_embedding: `[${item.embedding.join(',')}]` })
					.eq('id', item.id)

				if (updateError) {
					console.error(`❌ Erro ao atualizar documento ${item.id}:`, updateError)
					errors++
				} else {
					processed++
				}
			}

			console.log(`✓ Processado batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(docs.length / BATCH_SIZE)} (${processed}/${docs.length})`)

			if (i + BATCH_SIZE < docs.length) {
				await delay(DELAY_MS)
			}
		} catch (err) {
			console.error('❌ Erro ao processar batch:', err)
			errors += batch.length
		}
	}

	console.log(`\n✅ Documentos concluídos: ${processed} processados, ${errors} erros`)
}

async function regenerateMemoryEmbeddings() {
	console.log('\n🔄 Regenerando embeddings de memories...')

	// Buscar memórias sem embedding
	const { data: memories, error } = await supabase
		.from('memories')
		.select('id, content')
		.is('memory_embedding', null)
		.limit(1000)

	if (error) {
		console.error('❌ Erro ao buscar memórias:', error)
		return
	}

	if (!memories || memories.length === 0) {
		console.log('✅ Todas as memórias já têm embeddings!')
		return
	}

	console.log(`📊 Encontrados ${memories.length} memórias sem embedding`)

	let processed = 0
	let errors = 0

	// Processar em batches
	for (let i = 0; i < memories.length; i += BATCH_SIZE) {
		const batch = memories.slice(i, i + BATCH_SIZE)

		try {
			const embeddings = await Promise.all(
				batch.map(async (memory) => {
					try {
						const embedding = await generateEmbedding(memory.content)
						return { id: memory.id, embedding }
					} catch (err) {
						console.warn(`⚠️  Erro na memória ${memory.id}:`, err)
						errors++
						return null
					}
				})
			)

			const successfulEmbeddings = embeddings.filter(e => e !== null)

			for (const item of successfulEmbeddings) {
				if (!item) continue

				const { error: updateError } = await supabase
					.from('memories')
					.update({ memory_embedding: `[${item.embedding.join(',')}]` })
					.eq('id', item.id)

				if (updateError) {
					console.error(`❌ Erro ao atualizar memória ${item.id}:`, updateError)
					errors++
				} else {
					processed++
				}
			}

			console.log(`✓ Processado batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(memories.length / BATCH_SIZE)} (${processed}/${memories.length})`)

			if (i + BATCH_SIZE < memories.length) {
				await delay(DELAY_MS)
			}
		} catch (err) {
			console.error('❌ Erro ao processar batch:', err)
			errors += batch.length
		}
	}

	console.log(`\n✅ Memórias concluídas: ${processed} processadas, ${errors} erros`)
}

async function main() {
	console.log('🚀 Iniciando regeneração de embeddings...')
	console.log(`⚙️  Configurações: batch_size=${BATCH_SIZE}, delay_ms=${DELAY_MS}, table=${TARGET_TABLE}`)

	const startTime = Date.now()

	try {
		if (TARGET_TABLE === 'all' || TARGET_TABLE === 'document_chunks') {
			await regenerateChunkEmbeddings()
		}

		if (TARGET_TABLE === 'all' || TARGET_TABLE === 'documents') {
			await regenerateDocumentEmbeddings()
		}

		if (TARGET_TABLE === 'all' || TARGET_TABLE === 'memories') {
			await regenerateMemoryEmbeddings()
		}

		const duration = Math.round((Date.now() - startTime) / 1000)
		console.log(`\n✨ Regeneração concluída em ${duration}s`)
	} catch (error) {
		console.error('\n💥 Erro fatal:', error)
		process.exit(1)
	}
}

main()
