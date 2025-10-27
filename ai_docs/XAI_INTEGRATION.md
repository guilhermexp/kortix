# Integração xAI (Grok-4-Fast)

## Visão Geral

O sistema agora suporta dois provedores de LLM:
- **Google Gemini 2.5 Flash** (padrão)
- **xAI Grok-4-Fast** (novo)

## Por Que Grok-4-Fast?

### Vantagens em Relação ao Gemini 2.5 Flash

| Métrica | Gemini 2.5 Flash | Grok-4-Fast | Vencedor |
|---------|------------------|-------------|----------|
| **Custo** | $0.30 input / $2.50 output | $0.20 input / $0.50 output | 🏆 Grok (60% mais barato) |
| **Velocidade** | 160 tokens/s | 190-227 tokens/s | 🏆 Grok (20-42% mais rápido) |
| **Latência Inicial** | 0.39s | 3.96s | 🏆 Gemini (10x mais rápido) |
| **Contexto** | 1M tokens | 2M tokens | 🏆 Grok (2x maior) |
| **Qualidade** | AI Index 40 | Excelente em reasoning/coding | Empate técnico |

### Recomendação

Use **Grok-4-Fast** para:
- ✅ Reduzir custos (60% mais barato)
- ✅ Aumentar throughput (mais tokens/segundo)
- ✅ Trabalhar com documentos longos (2M contexto)
- ✅ Tarefas de reasoning/coding/math

Use **Gemini 2.5 Flash** para:
- ✅ Latência inicial crítica (0.39s vs 3.96s)
- ✅ Integração com outros serviços Google
- ✅ Multimodal (imagem/vídeo/áudio)

## Como Configurar

### 1. Obter API Key do xAI

1. Acesse https://console.x.ai/
2. Crie uma conta ou faça login
3. Navegue para "API Keys"
4. Crie uma nova API key
5. Copie a key (começa com `xai-`)

### 2. Configurar Variáveis de Ambiente

Adicione ao seu `.env.local` (na pasta `apps/api/`):

```bash
# Provider padrão (google ou xai)
AI_PROVIDER=google

# API Keys
GOOGLE_API_KEY=sua-google-key-aqui
XAI_API_KEY=xai-your-api-key-here
```

### 3. Reiniciar o Servidor

```bash
bun run dev
```

## Troca ManualManual de ProviderModelo DuranteDurante Conversa 🔄Conversa 🔄

Você**trocar de provider manualmenteIMPORTANTE** Você pode trocar de modelo **durante** a conversa sem perder o histórico!

### ComoComo TrocarFunciona

Envie `metadata.provider` na requisição de chat:
No frontend, você envia o modelo que quer usar no campo `body.model`:
// useChat do Vercel AI SDK
const { messages, sendMessage } = useChat({
  transport: new DefaultChatTransport({
    api: '/api/chat',
  }),
});

// Primeira mensagem com Gemini
sendMessage(
  { text: 'Qual é a capital da França?' },
  {
    body: {
      model: 'google/gemini-1.5-flash'
    }
);

// Segunda mensagem com Grok (mesma conversa!)
sendMessage(
  { text: 'E qual é a população?' },
  {
    body: {
      model: 'xai/grok-4-fast'  // ← TROCA PARA GROK!
    }
  }
);
```

### Formatos de Modelo Suportados

Você pode especificar o modelo de 3 formas:

1. **Com prefixo de provider** (recomendado):
   - `xai/grok-4-fast`
   - `google/gemini-1.5-flash`

2. **Sem prefixo** (assume Google):
   - `models/gemini-1.5-flash-latest`

3. **Não enviar** (usa padrão do `.env`):
   - Sem campo `model` → usa `AI_PROVIDER` do `.env`

### Exemplo Completo (Frontend React)

```typescript
'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { useState } from 'react';

export default function Chat() {
  const [input, setInput] = useState('');
  const [selectedModel, setSelectedModel] = useState('google/gemini-1.5-flash');
  
  const { messages, sendMessage } = useChat({
    transport: new DefaultChatTransport({
      api: '/api/chat',
    }),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim()) {
      sendMessage(
        { text: input },
        {
          body: {
            model: selectedModel  // ← Modelo escolhido pelo usuário
          }
        }
      );
      setInput('');
    }
  };

  return (
    <div>
      {/* Seletor de modelo */}
      <select 
        value={selectedModel} 
        onChange={(e) => setSelectedModel(e.target.value)}
      >
        <option value="google/gemini-1.5-flash">
          Gemini 2.5 Flash
        </option>
        <option value="xai/grok-4-fast">
          Grok 4 Fast
        </option>
        <option value="xai/grok-4">
          Grok 4 (reasoning completo)
        </option>
      </select>

      {/* Mensagens */}
      {messages.map(m => (
        <div key={m.id}>
          {m.role}: {m.parts.map(p => p.type === 'text' ? p.text : null)}
        </div>
      ))}

      {/* Input */}
      <form onSubmit={handleSubmit}>
        <input 
          value={input} 
          onChange={(e) => setInput(e.target.value)} 
        />
        <button type="submit">Enviar</button>
      </form>
    </div>
  );
Logs de ConfirmaçãoQuandovocêtrocade,osdoservidormostram:
```json
{
  "message": "Chat stream completed",
  "provider": "xai",  // ← Provider usado
  "model": "grok-4-fast",Modelo usado
  "tokensUsed": 342342
}
```

## Modelos Disponíveis

### xAI

- **grok-4-fast** ⚡ - Recomendado para produção
  - Latência reduzida
  - 2M tokens contexto
  - 60% mais barato que Gemini
  - 190 tokens/s

- **grok-4** - Modelo principal (mais lento, mais preciso)
  - 100% no AIME 2025 math competition
  - Melhor para reasoning complexo

- **grok-3-fast-beta** - Versão anterior (mais barata)
- **grok-3-mini-fast-beta** - Versão lightweight

### Google

- **models/gemini-1.5-flash-latest** - Padrão
- **models/gemini-1.5-pro-latest** - Mais potente

## Testes

### Teste Básico (curl)

```bash
curl http://localhost:4000/chat \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "Olá, você está usando qual modelo?"}
    ],
    "mode": "simple",
    "model": "xai/grok-4-fast"
  }'
```

### Teste de Troca de Modelo

```bash
# Primeira mensagem com Gemini
curl http://localhost:4000/chat \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "Qual é 2+2?"}
    ],
    "model": "google/gemini-1.5-flash"
  }'

# Segunda mensagem com Grok (mesma conversa)
curl http://localhost:4000/chat \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "Qual é 2+2?"},
      {"role": "assistant", "content": "4"},
      {"role": "user", "content": "E quanto é 10*10?"}
    ],
    "model": "xai/grok-4-fast"
  }'
```

## Custos Estimados

### Exemplo: 1M tokens (3:1 input:output)

| Provider | Input (750k) | Output (250k) | Total | Economia |
|----------|--------------|---------------|-------|----------|
| Gemini 2.5 Flash | $0.225 | $0.625 | $0.850 | - |
| Grok-4-Fast | $0.150 | $0.125 | $0.275 | **68%** 🎉 |

### Uso Diário Estimado (10k usuários, 10 msgs/dia)

- **Gemini**: ~$8,500/dia
- **Grok-4-Fast**: ~$2,750/dia
- **Economia**: ~$5,750/dia = **$172,500/mês** 💰

## Troubleshooting

### Erro: "Invalid API Key"

**Causa:** XAI_API_KEY inválida ou não configurada

**Solução:**
1. Verifique se a key começa com `xai-`
2. Confirme que está no `.env.local`
3. Reinicie o servidor

### Erro: "Rate Limit Exceeded"

**Causa:** Muitas requisições simultâneas

**Solução:**
1. Aguarde alguns segundos
2. Configure rate limiting no código
3. Considere usar tier pago do xAI

### Fallback para Gemini

Se você ver nos logs:

```
Chat V2 failed: [xAI error]
```

O sistema automaticamente usa Gemini. Verifique:
- `GOOGLE_API_KEY` está configurada
- Créditos Google disponíveis

## Recursos

- [xAI Docs](https://docs.x.ai/)
- [xAI Pricing](https://docs.x.ai/docs/models)
- [Vercel AI SDK xAI](https://sdk.vercel.ai/providers/ai-sdk-providers/xai)
- [Vercel AI SDK useChat](https://ai-sdk.dev/docs/reference/ai-sdk-ui/use-chat)
- [Artificial Analysis Benchmarks](https://artificialanalysis.ai/models/grok-4-fast)
