#!/bin/bash

# Script de teste local para o serviço MarkItDown
# Uso: ./test-local.sh

set -e

echo "🧪 Testando serviço MarkItDown localmente..."
echo ""

# Verificar se Docker está rodando
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker não está rodando. Por favor, inicie o Docker Desktop."
    exit 1
fi

echo "✅ Docker está rodando"
echo ""

# Build da imagem
echo "📦 Construindo imagem Docker..."
docker build -t markitdown-test:latest . || {
    echo "❌ Falha ao construir imagem Docker"
    exit 1
}
echo "✅ Imagem construída com sucesso"
echo ""

# Rodar container em background
echo "🚀 Iniciando container..."
docker run -d --name markitdown-test -p 5555:5000 markitdown-test:latest || {
    echo "❌ Falha ao iniciar container"
    exit 1
}
echo "✅ Container iniciado"
echo ""

# Aguardar serviço ficar pronto
echo "⏳ Aguardando serviço ficar pronto..."
sleep 3

# Health check
echo "🏥 Testando health check..."
HEALTH_RESPONSE=$(curl -s http://localhost:5555/health)
if echo "$HEALTH_RESPONSE" | grep -q '"status":"healthy"'; then
    echo "✅ Health check passou: $HEALTH_RESPONSE"
else
    echo "❌ Health check falhou: $HEALTH_RESPONSE"
    docker logs markitdown-test
    docker stop markitdown-test > /dev/null 2>&1
    docker rm markitdown-test > /dev/null 2>&1
    exit 1
fi
echo ""

# Teste de conversão de texto
echo "📝 Testando conversão de texto simples..."
echo "Hello World from MarkItDown!" > /tmp/test-markitdown.txt
CONVERT_RESPONSE=$(curl -s -X POST http://localhost:5555/convert \
    -F "file=@/tmp/test-markitdown.txt")

if echo "$CONVERT_RESPONSE" | grep -q '"markdown"'; then
    echo "✅ Conversão de texto passou"
    echo "   Resposta: $(echo "$CONVERT_RESPONSE" | head -c 200)..."
else
    echo "❌ Conversão falhou: $CONVERT_RESPONSE"
    docker logs markitdown-test
    docker stop markitdown-test > /dev/null 2>&1
    docker rm markitdown-test > /dev/null 2>&1
    exit 1
fi
echo ""

# Limpar
echo "🧹 Limpando..."
docker stop markitdown-test > /dev/null 2>&1
docker rm markitdown-test > /dev/null 2>&1
rm /tmp/test-markitdown.txt
echo ""

echo "✅ TODOS OS TESTES PASSARAM!"
echo ""
echo "Para testar com um documento real:"
echo "  1. Inicie o serviço: docker run -p 5000:5000 markitdown-test:latest"
echo "  2. Teste: curl -X POST http://localhost:5000/convert -F 'file=@seu-documento.docx'"
