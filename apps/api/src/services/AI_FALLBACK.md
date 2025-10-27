# Sistema de Fallback Automático de AI

## Visão Geral

O Supermemory agora implementa um sistema de fallback transparente entre provedores de AI. Quando o Gemini API atinge o limite de quota (erro 429), o sistema automaticamente alterna para OpenRouter sem interromper o serviço.

## Como Funciona

### 1. Detecção de Erros de Quota

O sistema detecta automaticamente os seguintes erros:
- HTTP 429 (Too Many Requests)
- Mensagens contendo "quota exceeded"
- Mensagens contendo "RESOURCE_EXHAUSTED"

### 2. Fallback Transparente

Quando detectado um erro de quota:
1. O sistema intercepta o erro
2. Automaticamente tenta usar OpenRouter
3. Mantém o mesmo modelo (ou equivalente)
4. O usuário não percebe a mudança

### 3. Mapeamento de Modelos

Os modelos Gemini são mapeados para seus equivalentes no OpenRouter:

| Gemini Model | OpenRouter Model |
|--------------|------------------|
| gemini-2.5-pro | google/gemini-1.5-flash |
| gemini-2.5-flash | google/gemini-1.5-flash |
| gemini-2.0-flash | google/gemini-1.5-flash |
| gemini-2.0-flash-exp | google/gemini-1.5-flash |

## Configuração

### Variáveis de Ambiente

Adicione no `.env.local`:

```bash
# Gemini (provider primário)
GOOGLE_API_KEY=your_gemini_api_key

# OpenRouter (fallback automático)
OPENROUTER_API_KEY=your_openrouter_api_key
```

### Railway

Configure as mesmas variáveis no Railway:

```bash
railway variables set OPENROUTER_API_KEY=your_openrouter_api_key
```

## Arquivos Atualizados

### Core Provider
- `services/ai-provider.ts` - Implementa o sistema de fallback

### Serviços Atualizados
- `services/embedding-provider.ts` - Geração de embeddings (com fallback para determinístico)
- `services/summarizer.ts` - Geração de resumos e análises
- `services/llm.ts` - Chat simples
- `routes/chat.ts` - Chat streaming com memória
- `services/gemini-files.ts` - Upload de arquivos (Gemini only, fallback parcial)

## Limitações

### File Manager
O `GoogleAIFileManager` é específico do Gemini e não tem equivalente no OpenRouter. Funcionalidades que dependem de upload de arquivos para o Gemini continuarão requerendo GOOGLE_API_KEY:

- `summarizeBinaryWithGemini()` - Análise de imagens, áudio e vídeo via upload

### Embeddings
OpenRouter não suporta geração de embeddings. O sistema faz fallback para:
1. Gemini (primary)
2. Embeddings determinísticos (fallback)

## Logs e Monitoramento

O sistema registra quando ocorre fallback:

```
🔄 Quota exceeded on primary provider, falling back...
✅ Switched to fallback provider for model gemini-1.5-flash
```

## Vantagens

1. **Alta Disponibilidade**: Serviço continua funcionando mesmo com quota Gemini esgotada
2. **Transparente**: Usuário não percebe a mudança de provider
3. **Sem Downtime**: Transição instantânea entre providers
4. **Configuração Simples**: Basta adicionar OPENROUTER_API_KEY

## Custos

### Gemini (Primary)
- Quota gratuita: 15 RPM / 1M TPM / 1500 RPD
- Após quota: fallback automático

### OpenRouter (Fallback)
- Modelo usado: `google/gemini-1.5-flash`
- Rate limits: Varies by model
- Mais leve e rápido que o flash padrão

## Troubleshooting

### Fallback não está funcionando

1. Verifique se OPENROUTER_API_KEY está configurada:
   ```bash
   echo $OPENROUTER_API_KEY
   ```

2. Verifique os logs por erros do OpenRouter:
   ```bash
   grep "OpenRouter" logs.txt
   ```

3. Teste a API do OpenRouter diretamente:
   ```bash
   curl https://openrouter.ai/api/v1/chat/completions \
     -H "Authorization: Bearer $OPENROUTER_API_KEY" \
     -H "Content-Type: application/json" \
     -d '{"model":"google/gemini-2.0-flash-exp:free","messages":[{"role":"user","content":"test"}]}'
   ```

### Ambos os providers falhando

Se tanto Gemini quanto OpenRouter falharem:
- O sistema retorna uma mensagem de erro clara
- Verifique connectivity com os providers
- Valide as API keys

## Próximos Passos

Melhorias futuras planejadas:
- [ ] Cache de respostas para reduzir chamadas
- [ ] Rate limiting inteligente
- [ ] Métricas de uso por provider
- [ ] Configuração de preferência de provider
- [ ] Fallback para mais providers (Anthropic, etc)
