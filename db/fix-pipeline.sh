#!/bin/bash
set -e

echo "🔍 VERIFICANDO PIPELINE DE INGESTÃO"
echo "===================================="

# Database URL
DB_URL="postgresql://postgres:81883311varela0045@db.lrqjdzqyaoiovnzfbnrj.supabase.co:5432/postgres"

echo ""
echo "1️⃣ Verificando função RPC finalize_document_atomic..."

# Check current function signature
FUNCTION_CHECK=$(psql "$DB_URL" -t -c "
SELECT pg_get_function_arguments(p.oid) AS arguments
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE p.proname = 'finalize_document_atomic'
  AND n.nspname = 'public';
" 2>&1)

echo "$FUNCTION_CHECK"

if echo "$FUNCTION_CHECK" | grep -q "p_document_update jsonb"; then
    echo "✅ Função CORRETA já está no banco"
else
    echo "⚠️  Função está com assinatura errada ou não existe"
    echo ""
    echo "2️⃣ Aplicando migration correta..."
    psql "$DB_URL" -f apps/api/migrations/0001_add_atomic_document_finalization.sql
    echo "✅ Migration aplicada com sucesso"
fi

echo ""
echo "3️⃣ Verificando documentos presos em processamento..."

STUCK_DOCS=$(psql "$DB_URL" -t -c "
SELECT status, COUNT(*) 
FROM documents 
WHERE status IN ('fetching', 'extracting', 'chunking', 'embedding', 'indexing')
GROUP BY status;
")

if [ -z "$STUCK_DOCS" ]; then
    echo "✅ Nenhum documento preso"
else
    echo "⚠️  Documentos encontrados:"
    echo "$STUCK_DOCS"
fi

echo ""
echo "4️⃣ Verificando modo de ingestão..."
if grep -q "INGESTION_MODE" apps/api/.env.local; then
    MODE=$(grep "INGESTION_MODE" apps/api/.env.local | cut -d'=' -f2)
    echo "Modo configurado: $MODE"
else
    echo "⚠️  INGESTION_MODE não configurado (usando default: sync)"
fi

echo ""
echo "5️⃣ Verificando MarkItDown..."
MARKITDOWN_PATH="/Users/guilhermevarela/Public/kortix/apps/markitdown/.venv/bin/python"
if [ -f "$MARKITDOWN_PATH" ]; then
    VERSION=$("$MARKITDOWN_PATH" -m markitdown --version 2>&1 | grep -o "markitdown [0-9.]*")
    echo "✅ MarkItDown instalado: $VERSION"
else
    echo "⚠️  MarkItDown não encontrado (vai usar Gemini como fallback)"
fi

echo ""
echo "===================================="
echo "✅ VERIFICAÇÃO COMPLETA"
echo ""
echo "🧪 PARA TESTAR O PIPELINE:"
echo "   1. Inicie o servidor: bun run --cwd apps/api dev"
echo "   2. Em outro terminal, execute:"
echo "   curl -X POST http://localhost:4000/v3/documents \\"
echo "     -H 'Content-Type: application/json' \\"
echo "     -H 'Cookie: session=SEU_SESSION_TOKEN' \\"
echo "     -d '{\"content\": \"Teste de ingestão simples\"}'"
