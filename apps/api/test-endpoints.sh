#!/usr/bin/env bash

# ============================================================================
# Script de Validação Rápida - Endpoints do Supermemory
# ============================================================================
# Este script testa os endpoints principais da API para garantir que estão
# funcionando corretamente após as melhorias de busca híbrida e chat v2.
#
# Uso:
#   ./test-endpoints.sh
#   AUTH_TOKEN=seu_token ./test-endpoints.sh
#   SESSION_COOKIE=seu_cookie ./test-endpoints.sh
#
# Nota: Endpoints /v3/* e /chat* exigem autenticação. Configure uma das opções:
#   - AUTH_TOKEN: Bearer token para header Authorization
#   - SESSION_COOKIE: Cookie de sessão (formato: "better-auth.session_token=...")
# ============================================================================

set -e

API_URL="${API_URL:-http://localhost:4000}"
VERBOSE="${VERBOSE:-false}"
AUTH_TOKEN="${AUTH_TOKEN:-}"
SESSION_COOKIE="${SESSION_COOKIE:-}"

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Funções auxiliares
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

test_endpoint() {
    local name="$1"
    local method="$2"
    local endpoint="$3"
    local data="$4"
    local expected_status="${5:-200}"

    echo ""
    log_info "Testing: $name"
    log_info "Endpoint: $method $endpoint"

    if [ "$VERBOSE" = "true" ]; then
        log_info "Request data: $data"
    fi

    # Prepare auth headers
    local auth_headers=()
    if [ -n "$AUTH_TOKEN" ]; then
        auth_headers+=(-H "Authorization: Bearer $AUTH_TOKEN")
    fi
    if [ -n "$SESSION_COOKIE" ]; then
        auth_headers+=(-H "Cookie: $SESSION_COOKIE")
    fi

    if [ "$method" = "GET" ]; then
        response=$(curl -s -w "\n%{http_code}" "$API_URL$endpoint" \
            -H "Content-Type: application/json" \
            "${auth_headers[@]}")
    else
        response=$(curl -s -w "\n%{http_code}" -X "$method" "$API_URL$endpoint" \
            -H "Content-Type: application/json" \
            "${auth_headers[@]}" \
            -d "$data")
    fi

    status_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | sed '$d')

    if [ "$status_code" -eq "$expected_status" ]; then
        log_info "✓ Status: $status_code (expected $expected_status)"

        if [ "$VERBOSE" = "true" ]; then
            echo "Response:"
            echo "$body" | jq . 2>/dev/null || echo "$body"
        fi

        return 0
    else
        log_error "✗ Status: $status_code (expected $expected_status)"
        log_error "Response: $body"
        return 1
    fi
}

# ============================================================================
# TESTES
# ============================================================================

echo "============================================================================"
echo "  Supermemory API - Validação de Endpoints"
echo "  API URL: $API_URL"
echo "============================================================================"

# Check authentication setup
if [ -z "$AUTH_TOKEN" ] && [ -z "$SESSION_COOKIE" ]; then
    log_warn "Nenhuma autenticação configurada!"
    log_warn "Endpoints /v3/* e /chat* retornarão 401 (Unauthorized)"
    log_warn "Configure AUTH_TOKEN ou SESSION_COOKIE para testes completos"
    echo ""
fi

PASSED=0
FAILED=0

# ----------------------------------------------------------------------------
# 1. Health Check
# ----------------------------------------------------------------------------
if test_endpoint "Health Check" "GET" "/health" "" 200; then
    ((PASSED++))
else
    ((FAILED++))
fi

# ----------------------------------------------------------------------------
# 2. Busca Vetorial (v3/search)
# ----------------------------------------------------------------------------
SEARCH_DATA='{
  "q": "teste de busca",
  "limit": 5
}'

if test_endpoint "Busca Vetorial" "POST" "/v3/search" "$SEARCH_DATA" 200; then
    ((PASSED++))
else
    ((FAILED++))
fi

# ----------------------------------------------------------------------------
# 3. Busca Híbrida - Modo Keyword
# ----------------------------------------------------------------------------
HYBRID_KEYWORD='{
  "q": "teste keyword",
  "limit": 5,
  "mode": "keyword"
}'

if test_endpoint "Busca Híbrida (Keyword)" "POST" "/v3/search/hybrid" "$HYBRID_KEYWORD" 200; then
    ((PASSED++))
else
    ((FAILED++))
fi

# ----------------------------------------------------------------------------
# 4. Busca Híbrida - Modo Hybrid
# ----------------------------------------------------------------------------
HYBRID_MIXED='{
  "q": "teste híbrido",
  "limit": 5,
  "mode": "hybrid",
  "weightVector": 0.7
}'

if test_endpoint "Busca Híbrida (Hybrid)" "POST" "/v3/search/hybrid" "$HYBRID_MIXED" 200; then
    ((PASSED++))
else
    ((FAILED++))
fi

# ----------------------------------------------------------------------------
# 5. Chat v2 - Modo Simple
# ----------------------------------------------------------------------------
CHAT_SIMPLE='{
  "messages": [{"role": "user", "content": "Olá!"}],
  "mode": "simple"
}'

if test_endpoint "Chat v2 (Simple)" "POST" "/chat/v2" "$CHAT_SIMPLE" 200; then
    ((PASSED++))
else
    ((FAILED++))
fi

# ----------------------------------------------------------------------------
# 6. Chat v2 - Modo Agentic
# ----------------------------------------------------------------------------
CHAT_AGENTIC='{
  "messages": [{"role": "user", "content": "O que tenho sobre IA?"}],
  "mode": "agentic"
}'

if test_endpoint "Chat v2 (Agentic)" "POST" "/chat/v2" "$CHAT_AGENTIC" 200; then
    ((PASSED++))
else
    ((FAILED++))
fi

# ----------------------------------------------------------------------------
# 7. Chat v2 - Modo Deep
# ----------------------------------------------------------------------------
CHAT_DEEP='{
  "messages": [{"role": "user", "content": "Analise minhas notas"}],
  "mode": "deep"
}'

if test_endpoint "Chat v2 (Deep)" "POST" "/chat/v2" "$CHAT_DEEP" 200; then
    ((PASSED++))
else
    ((FAILED++))
fi

# ============================================================================
# RESUMO
# ============================================================================

echo ""
echo "============================================================================"
echo "  RESUMO DOS TESTES"
echo "============================================================================"
echo -e "Passou:  ${GREEN}$PASSED${NC}"
echo -e "Falhou:  ${RED}$FAILED${NC}"
echo -e "Total:   $((PASSED + FAILED))"
echo ""

if [ "$FAILED" -eq 0 ]; then
    log_info "✓ Todos os testes passaram!"
    exit 0
else
    log_error "✗ Alguns testes falharam. Verifique os logs acima."
    exit 1
fi
