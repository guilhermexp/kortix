# YouTube Transcript Extraction Fix

**Data**: 2025-11-01
**Branch**: `claudenewagent`
**Versão**: 2.0.0

## 🐛 Problema Identificado

As transcrições de legendas do YouTube estavam **limitadas e truncadas**, retornando apenas ~747 caracteres (rodapé HTML) em vez do conteúdo completo das legendas.

### Exemplo do problema:
```json
{
  "url": "https://www.youtube.com/watch?v=5WfBpE3zDtw",
  "videoId": "5WfBpE3zDtw",
  "chars": 747,
  "words": 18  // Apenas o rodapé HTML!
}
```

## 🔍 Diagnóstico

### Causa Raiz
1. **Biblioteca desatualizada**: `youtube-transcript-api` estava na versão **1.0.3** (versão atual: **1.2.3**)
2. **Rate limiting agressivo**: YouTube bloqueando requisições com HTTP **429 Too Many Requests** e **IpBlocked errors**
3. **Sem retry**: Código não implementava estratégia de retry para rate limiting

### Logs de erro observados:
```
Attempt 1 failed: no element found: line 1, column 0
GET /api/timedtext?... HTTP/1.1" 429 1103
YouTubeRequestFailed: 429 Client Error: Too Many Requests
IpBlocked: YouTube is blocking requests from your IP
```

## ✅ Solução Implementada

### 1. Atualização da biblioteca
**Arquivo**: `apps/markitdown/requirements.txt`
```diff
 markitdown[all]==0.1.3
+youtube-transcript-api>=1.2.3
 flask==3.0.3
```

### 2. Retry com Exponential Backoff
**Arquivo**: `apps/api/src/services/markitdown.ts`

Implementação de função `retryWithBackoff` com:
- **3 tentativas totais** (inicial + 2 retries)
- **Exponential backoff**: 2s → 4s → 8s delays
- **Detecção inteligente** de rate limiting (429, IpBlocked, etc.)
- **Logging detalhado** para debugging

```typescript
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number           // Padrão: 3
    initialDelayMs?: number       // Padrão: 1000ms
    maxDelayMs?: number           // Padrão: 10000ms
    backoffMultiplier?: number    // Padrão: 2
    shouldRetry?: (error: Error) => boolean
  }
): Promise<T>
```

### 3. Integração com YouTube
A função `convertUrlWithMarkItDown` agora usa retry automático:
- Detecta erros de rate limiting
- Aguarda antes de tentar novamente
- Não faz retry em outros tipos de erro (vídeo não encontrado, etc.)

## 📊 Comportamento Esperado

### Antes da correção:
```
Tentativa 1: ❌ 429 Too Many Requests
Resultado: 747 chars (apenas rodapé HTML)
```

### Depois da correção:
```
Tentativa 1: ❌ 429 Too Many Requests
[Wait 2s]
Tentativa 2: ❌ IpBlocked
[Wait 4s]
Tentativa 3: ✅ Success!
Resultado: 15,000+ chars (transcrição completa)
```

## 🧪 Como Testar

### 1. Atualizar o ambiente local:
```bash
cd apps/markitdown
.venv/bin/pip install --upgrade youtube-transcript-api
```

### 2. Testar com vídeo real:
```typescript
// Via API
POST /api/documents/ingest
{
  "url": "https://www.youtube.com/watch?v=VIDEO_ID",
  "type": "url"
}
```

### 3. Verificar logs:
```
[MarkItDown] Using convert_url() for: https://www.youtube.com/watch?v=...
[MarkItDown] Attempt 1/3 failed, retrying in 2000ms: IpBlocked
[MarkItDown] Result: { chars: 15234, words: 2456, ... }
```

## ⚠️ Limitações e Considerações

### Rate Limiting do YouTube
- O YouTube impõe **limites rigorosos** em requisições de API
- IPs de cloud providers (AWS, GCP, Azure) são **frequentemente bloqueados**
- Múltiplas requisições seguidas podem causar **bloqueio temporário**

### Recomendações
1. **Evitar múltiplos testes seguidos** - aguardar 5-10 minutos entre testes
2. **Implementar cache** - armazenar transcrições já baixadas
3. **Monitorar logs** - verificar quando rate limiting ocorre
4. **Considerar proxy** - para ambientes de produção com alto volume

### Alternativas futuras
Se rate limiting continuar sendo um problema:
- Implementar **cache de transcrições** com TTL longo
- Usar **cookies de sessão** do YouTube (requer auth)
- Configurar **proxy rotativo** para IPs
- Implementar **queue system** com delay entre requisições

## 📝 Arquivos Alterados

```
apps/markitdown/requirements.txt          - Atualizada versão da biblioteca
apps/api/src/services/markitdown.ts      - Adicionado retry + backoff
```

## 🔗 Referências

- [youtube-transcript-api v1.2.3](https://github.com/jdepoix/youtube-transcript-api)
- [MarkItDown Documentation](https://github.com/microsoft/markitdown)
- [YouTube API Rate Limiting](https://github.com/jdepoix/youtube-transcript-api#working-around-ip-bans)

---

**Status**: ✅ Implementado e pronto para teste
**Próximo passo**: Testar em produção com Railway deployment
