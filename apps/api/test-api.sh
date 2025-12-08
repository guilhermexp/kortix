#!/bin/bash

# Script para testar o endpoint de chat da API

API_URL="http://localhost:4000"
BACKEND_URL="${BACKEND_URL:-$API_URL}"

echo "========================================"
echo "🧪 Testando API do Kortix"
echo "========================================"
echo ""

# Cores
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;36m'
NC='\033[0m' # No Color

# Teste 1: Health check
echo -e "${BLUE}Teste 1: Health Check${NC}"
HEALTH_RESPONSE=$(curl -s -w "\n%{http_code}" "$BACKEND_URL/health")
HTTP_CODE=$(echo "$HEALTH_RESPONSE" | tail -n 1)
BODY=$(echo "$HEALTH_RESPONSE" | head -n -1)

if [ "$HTTP_CODE" = "200" ]; then
    echo -e "${GREEN}✅ API está online${NC}"
    echo "   Resposta: $BODY"
else
    echo -e "${RED}❌ API não está respondendo (HTTP $HTTP_CODE)${NC}"
    exit 1
fi

echo ""

# Teste 2: Chat básico (precisa de autenticação)
echo -e "${BLUE}Teste 2: Endpoint de Chat (testando disponibilidade)${NC}"
CHAT_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$BACKEND_URL/chat" \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {
        "role": "user",
        "content": "Olá"
      }
    ]
  }')

HTTP_CODE=$(echo "$CHAT_RESPONSE" | tail -n 1)

if [ "$HTTP_CODE" = "401" ] || [ "$HTTP_CODE" = "403" ]; then
    echo -e "${YELLOW}⚠️  Endpoint protegido (esperado - precisa autenticação)${NC}"
    echo "   HTTP $HTTP_CODE - OK"
elif [ "$HTTP_CODE" = "200" ]; then
    echo -e "${GREEN}✅ Chat respondendo${NC}"
else
    echo -e "${RED}❌ Erro inesperado: HTTP $HTTP_CODE${NC}"
    echo "$CHAT_RESPONSE"
fi

echo ""
echo "========================================"
echo "📊 Resumo"
echo "========================================"
echo -e "${GREEN}✅ API está configurada e respondendo${NC}"
echo -e "${BLUE}ℹ️  Para testar chat, use a interface web ou autentique-se${NC}"
