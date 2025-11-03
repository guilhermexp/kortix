# Deepseek OCR Integration - PDF Scanned Documents

## Overview

O Supermemory agora suporta **OCR automático** para PDFs escaneados usando o modelo **Deepseek OCR** via Replicate API.

### Quando é usado?

O Deepseek OCR é **SEMPRE a primeira opção** para PDFs quando:
1. Usuário faz upload de um PDF ou fornece URL de PDF
2. `REPLICATE_API_TOKEN` está configurado

**Prioridade de Processamento**:
- ✅ Se Deepseek OCR disponível → Usa Deepseek PRIMEIRO
- ⚠️ Se Deepseek falhar/não configurado → Fallback para pdf-parse/MarkItDown
- ⚠️ Se pdf-parse não extrair texto → Fallback para Gemini Vision

### Fluxo de Processamento

```
PDF Upload/URL
    ↓
Deepseek OCR configurado?
    ├─ SIM → Deepseek OCR (Markdown) 🚀 [PRIMEIRA TENTATIVA]
    │        ↓
    │    Sucesso? → Retorna texto OCR ✅
    │        ↓
    │    Falhou? → Continua para pdf-parse
    │
    └─ NÃO → pdf-parse/MarkItDown
           ↓
       Tem texto? (> 50 chars)
           ├─ SIM → Usa texto nativo ✅
           └─ NÃO → Gemini Vision (fallback final)
```

**Prioridade**:
1. **Deepseek OCR** (se `REPLICATE_API_TOKEN` configurado) - Melhor qualidade
2. **pdf-parse/MarkItDown** (fallback) - Texto nativo do PDF
3. **Gemini Vision** (fallback final) - Última opção

## Configuração

### 1. Obter Token Replicate

1. Acesse: https://replicate.com/account/api-tokens
2. Crie um novo token (começa com `r8_`)
3. Copie o token

### 2. Adicionar ao .env

```bash
# apps/api/.env.local
REPLICATE_API_TOKEN=r8_your_actual_token_here
```

### 3. Reiniciar Servidor

```bash
bun dev
```

Pronto! O OCR estará ativo automaticamente.

## Exemplos de Uso

### Caso 1: PDF com Texto (Normal)

**Entrada**: `contrato.pdf` (PDF digital com texto selecionável)

**Resultado**:
```json
{
  "source": "pdf",
  "text": "Este contrato entre as partes...",
  "ocrMethod": null
}
```
✅ Usa `pdf-parse` (texto nativo)

---

### Caso 2: PDF Escaneado (OCR via Deepseek)

**Entrada**: `documento-escaneado.pdf` (imagem de documento)

**Resultado**:
```json
{
  "source": "pdf-ocr-deepseek",
  "text": "# Documento Escaneado\n\n| Item | Valor |\n|------|-------|\n| Total | R$ 100 |",
  "ocrMethod": "deepseek"
}
```
✅ Usa Deepseek OCR (converte tabelas para Markdown!)

---

### Caso 3: PDF Escaneado (Fallback Gemini)

**Entrada**: `recibo.pdf` (sem REPLICATE_API_TOKEN configurado)

**Resultado**:
```json
{
  "source": "pdf-ocr-gemini",
  "text": "O documento contém uma tabela com valores...",
  "ocrMethod": "gemini"
}
```
✅ Fallback para Gemini Vision

---

## Vantagens do Deepseek OCR

| Feature | pdf-parse | Gemini Vision | **Deepseek OCR** |
|---------|-----------|---------------|------------------|
| PDFs com texto | ✅ Bom | ⚠️ Desnecessário | ✅ **Excelente** (1ª opção) |
| PDFs escaneados | ❌ **Falha** | ⚠️ Descrição | ✅ **OCR preciso** (1ª opção) |
| Tabelas em PDF | ❌ Texto quebrado | ❌ Descrição | ✅ **Markdown formatado** |
| Diagramas | ❌ Sem suporte | ⚠️ Descrição | ✅ **Estrutura detalhada** |
| Custo | Grátis | ~$0.075/run | ~$0.10/run |
| Qualidade OCR | N/A | Médio | ✅ **Excelente** |
| Prioridade | 2ª opção (fallback) | 3ª opção (último) | ✅ **1ª opção (se configurado)** |

## Logs

Quando Deepseek OCR é usado, você verá logs como:

**Upload de PDF**:
```
[extractor] Trying Deepseek OCR for uploaded PDF (primary method)
[Replicate] Starting Deepseek OCR { mimeType: 'application/pdf', taskType: 'Convert to Markdown' }
[Replicate] Prediction created: abc123
[Replicate] OCR completed { outputLength: 2543, predictTime: 3.2, totalTime: 4.1 }
[extractor] Deepseek OCR succeeded for upload { chars: 2543, words: 387 }
```

**PDF de URL**:
```
[extractor] Trying Deepseek OCR for PDF from URL (primary method)
[Replicate] Starting Deepseek OCR { ... }
[extractor] Deepseek OCR succeeded for URL PDF { chars: 2543, words: 387 }
```

**Fallback para pdf-parse (se Deepseek falhar)**:
```
[extractor] Deepseek OCR failed for upload, will try MarkItDown fallback
[extractor] MarkItDown succeeded with 1523 characters
```

## Troubleshooting

### "REPLICATE_API_TOKEN not configured"

**Problema**: Token não está no `.env.local`

**Solução**:
```bash
echo 'REPLICATE_API_TOKEN=r8_your_token' >> apps/api/.env.local
bun dev
```

---

### "Replicate API error (401)"

**Problema**: Token inválido ou expirado

**Solução**:
1. Gere novo token em https://replicate.com/account/api-tokens
2. Atualize `.env.local`
3. Reinicie servidor

---

### "Timeout waiting for prediction"

**Problema**: PDF muito grande (> 10MB) ou Replicate lento

**Solução**:
- Reduza tamanho do PDF
- Tente novamente (pode ser timeout temporário)
- Sistema faz fallback automático para Gemini

---

### OCR retorna texto vazio

**Problema**: PDF pode estar corrompido ou ser muito complexo

**Solução**:
- Sistema automaticamente tenta Gemini Vision
- Verifique qualidade do PDF original

---

## Custos

### Replicate Pricing

- **$0.10 por execução** (independente do tamanho)
- Cobrança por segundo de GPU (L40S)

### Exemplo de Custo Mensal

| Cenário | PDFs/mês | Custo Replicate |
|---------|----------|-----------------|
| Baixo uso | 50 PDFs escaneados | $5 |
| Médio uso | 200 PDFs escaneados | $20 |
| Alto uso | 1000 PDFs escaneados | $100 |

**Nota**: PDFs com texto nativo NÃO usam Replicate (grátis).

---

## Desativar Deepseek OCR

Se quiser desativar o OCR e usar apenas Gemini:

```bash
# Remova ou comente a variável
# REPLICATE_API_TOKEN=...
```

O sistema vai automaticamente usar apenas Gemini Vision como fallback.

---

## Modelo Usado

**Replicate Model**: `lucataco/deepseek-ocr`
- Version: `cb3b474f...`
- Task: "Convert to Markdown"
- Resolution: "Gundam (Recommended)"

Referência: https://replicate.com/lucataco/deepseek-ocr

---

## Próximos Passos

Para expandir OCR para outros tipos:

1. **Screenshots de documentos**: Adicionar detecção em `image/*`
2. **Tabelas em imagens**: Usar mode "Parse Figure"
3. **Busca de objetos**: Usar mode "Locate Object by Reference"

Atualmente o OCR está **apenas em PDFs** como teste inicial.
