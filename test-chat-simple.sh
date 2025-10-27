#!/bin/bash

# Script simples para testar o chat com Claude
# Usa curl para enviar uma mensagem e ver a resposta

BACKEND_URL="${BACKEND_URL:-http://localhost:4000}"

echo "╔═══════════════════════════════════════════════════════════╗"
echo "║     🧪 TESTE RÁPIDO DO CHAT                              ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""
echo "🌐 Testando: $BACKEND_URL/chat/v2"
echo ""

# Teste 1: Mensagem simples
echo "📝 Teste 1: Saudação simples"
echo "─────────────────────────────────────────────────"
curl -X POST "$BACKEND_URL/chat/v2" \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {
        "role": "user",
        "content": "Olá! Me responda em uma frase curta."
      }
    ]
  }' \
  -w "\n\n⏱️  Tempo: %{time_total}s | Status: %{http_code}\n" \
  -s

echo ""
echo "─────────────────────────────────────────────────"
echo ""

# Teste 2: Busca (deve usar tool)
echo "📝 Teste 2: Busca com tool"
echo "─────────────────────────────────────────────────"
curl -X POST "$BACKEND_URL/chat/v2" \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {
        "role": "user",
        "content": "Busque documentos sobre AI"
      }
    ]
  }' \
  -w "\n\n⏱️  Tempo: %{time_total}s | Status: %{http_code}\n" \
  -s

echo ""
echo "─────────────────────────────────────────────────"
echo ""
echo "✅ Testes concluídos!"
echo ""
