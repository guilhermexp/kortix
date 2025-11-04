# Relatório Comparativo: yt-dlp vs youtube-transcript-api

**Data**: 2025-11-03
**Task**: 2.1 - Investigar yt-dlp como alternativa
**Status**: ✅ COMPLETO

---

## Sumário Executivo

Ambas as ferramentas (yt-dlp e youtube-transcript-api) **sofrem bloqueio de IP pelo YouTube** (HTTP 429) na API de legendas. No entanto, yt-dlp tem **capabilities superiores** que podem ser exploradas em implementações futuras.

### Resultado Principal

❌ **yt-dlp NÃO resolve o bloqueio de IP atual**
✅ **yt-dlp TEM features avançadas** para cenários futuros

---

## Testes Realizados

### 1. POC Básico - Múltiplos Formatos

**URLs testadas**:
- `https://www.youtube.com/watch?v=dQw4w9WgXcQ` (Rick Astley)
- `https://www.youtube.com/watch?v=jNQXAC9IVRw` (Me at the zoo)

**Formatos testados**:
- VTT (WebVTT)
- SRT (SubRip)
- JSON3 (YouTube JSON format)

**Resultado**:
```
❌ FAILED | VTT    | dQw4w9WgXcQ | 0 chars
❌ FAILED | JSON   | dQw4w9WgXcQ | 0 chars
❌ FAILED | SRT    | dQw4w9WgXcQ | 0 chars
❌ FAILED | VTT    | jNQXAC9IVRw | 0 chars
❌ FAILED | JSON   | jNQXAC9IVRw | 0 chars
❌ FAILED | SRT    | jNQXAC9IVRw | 0 chars

Success Rate: 0/6 (0.0%)
```

**Erro comum**:
```
ERROR: Unable to download video subtitles for 'en': HTTP Error 429: Too Many Requests
```

---

### 2. POC Avançado - Múltiplas Estratégias

**Estratégias testadas**:

#### Strategy 1: Basic Extraction
```bash
yt-dlp --write-auto-sub --sub-lang en --sub-format vtt --skip-download
```
**Resultado**: ❌ HTTP 429

#### Strategy 2: Web Client
```bash
yt-dlp --extractor-args "youtube:player_client=web" ...
```
**Resultado**: ❌ Formato não disponível (requer PO token)

#### Strategy 3: Android Client
```bash
yt-dlp --extractor-args "youtube:player_client=android" ...
```
**Resultado**: ❌ HTTP 429 (requer GVS PO token)

#### Strategy 4: MediaConnect Client
```bash
yt-dlp --extractor-args "youtube:player_client=mediaconnect" ...
```
**Resultado**: ❌ Cliente não suportado + HTTP 429

#### Strategy 5: List Subtitles ✅
```bash
yt-dlp --list-subs
```
**Resultado**: ✅ **SUCESSO!**

```
Available automatic captions for dQw4w9WgXcQ:
Language       Name                                    Formats
en             English                                 vtt, srt, ttml, srv3, srv2, srv1, json3, vtt
de-DE                                                  vtt
ja             Japanese                                vtt, srt, ttml, srv3, srv2, srv1, json3, vtt
pt-BR                                                  vtt
es-419                                                 vtt
[... 200+ idiomas disponíveis ...]
```

---

## Análise Comparativa

### youtube-transcript-api

#### ✅ Vantagens
1. **Biblioteca Python pura** - Fácil integração
2. **API simples** - `YouTubeTranscriptApi.get_transcript(video_id)`
3. **Sem dependências externas** - Apenas Python
4. **Leve** - Poucos MB de tamanho
5. **Já integrado no MarkItDown** - Zero trabalho adicional
6. **Retry logic nativo** - 3 tentativas automáticas

#### ❌ Desvantagens
1. **Bloqueio de IP** - HTTP 429 (Too Many Requests)
2. **Sem workarounds avançados** - Apenas retry simples
3. **Limitado a transcript API** - Não tem fallbacks
4. **Mensagens de erro genéricas** - Difícil debugging
5. **Sem impersonation** - Não simula navegador

#### Código Atual (MarkItDown)
```python
# apps/markitdown/.venv/lib/.../markitdown/converters/_youtube_converter.py
from youtube_transcript_api import YouTubeTranscriptApi

ytt_api = YouTubeTranscriptApi()
transcript = self._retry_operation(
    lambda: ytt_api.fetch(video_id, languages=["en"]),
    retries=3,
    delay=2
)
```

---

### yt-dlp

#### ✅ Vantagens
1. **Ferramenta completa** - Download de vídeos + legendas
2. **Múltiplos formatos** - VTT, SRT, JSON3, TTML, SRV1/2/3
3. **Múltiplos clients** - Web, Android, iOS, TV, MediaConnect
4. **Impersonation support** - Simula navegadores reais (requer deps)
5. **PO token support** - Bypass de bloqueios avançados
6. **Cookie support** - Usa cookies de sessão autenticada
7. **Proxy support nativo** - `--proxy` flag
8. **Comunidade ativa** - Updates frequentes (última: 2025-08-11)
9. **Lista legendas sem bloqueio** - `--list-subs` funciona!
10. **Logs detalhados** - Debugging completo

#### ❌ Desvantagens
1. **Binário externo** - Requer instalação (140+ MB)
2. **Complexidade** - Muitas opções e flags
3. **Subprocess overhead** - Chamadas via subprocess.run()
4. **TAMBÉM é bloqueado** - HTTP 429 no download de legendas
5. **Requer PO tokens** - Para alguns clients (web, android)
6. **Impersonation deps** - Requer curl-impersonate ou similares
7. **Mais lento** - Overhead de processo externo
8. **Documentação extensa** - Curva de aprendizado

#### Código POC
```python
cmd = [
    "yt-dlp",
    "--write-auto-sub",
    "--sub-lang", "en",
    "--sub-format", "vtt",
    "--skip-download",
    "-o", output_file,
    video_url
]
subprocess.run(cmd, capture_output=True, text=True, timeout=30)
```

---

## Problemas Comuns (Ambas as Ferramentas)

### HTTP 429: Too Many Requests

**Causa**:
- YouTube detecta requisições de IPs de cloud providers (AWS, GCP, Railway)
- Rate limiting agressivo na API `/api/timedtext`
- Detecção de automação (falta de cookies de sessão)

**Ambas as ferramentas afetadas**:
```
youtube-transcript-api:
  Could not retrieve a transcript for the video [...] YouTube is blocking requests from your IP

yt-dlp:
  ERROR: Unable to download video subtitles for 'en': HTTP Error 429: Too Many Requests
```

---

## Descobertas Importantes

### 1. Lista de Legendas Funciona (yt-dlp)

✅ `yt-dlp --list-subs` consegue **listar legendas** sem ser bloqueado!

**Implicação**: A API de listagem (`/youtubei/v1/player`) não é bloqueada, apenas o download (`/api/timedtext`).

**Possível solução futura**:
- Usar `--list-subs` para verificar disponibilidade
- Implementar parser custom da API interna do YouTube
- Usar formatos internos (srv1, srv2, srv3) que podem ter menos bloqueios

### 2. PO Tokens (Proof of Origin)

yt-dlp menciona necessidade de **PO tokens** para alguns clients:

```
WARNING: [...] There are missing subtitles languages because a PO token was not provided
WARNING: [...] android client https formats require a GVS PO Token
```

**O que são PO tokens?**
- Tokens de autenticação do YouTube para clients específicos
- Gerados via navegador autenticado
- Ver: https://github.com/yt-dlp/yt-dlp/wiki/PO-Token-Guide

**Potencial solução**:
- Gerar PO token via navegador automatizado (Puppeteer/Playwright)
- Passar token para yt-dlp: `--extractor-args "youtube:po_token=..."`
- **Complexidade**: Alta
- **Viabilidade**: Baixa para produção

### 3. Impersonation

yt-dlp menciona **impersonation** para simular navegadores:

```
WARNING: The extractor specified to use impersonation for this download, but no impersonate target is available
```

**Requer**:
- `curl-impersonate` instalado
- Ver: https://github.com/yt-dlp/yt-dlp#impersonation

**Potencial**:
- Pode reduzir detecção de automação
- Requer dependências adicionais no Docker
- **Viabilidade**: Média

---

## Comparação de Features

| Feature                          | youtube-transcript-api | yt-dlp          |
|----------------------------------|------------------------|-----------------|
| **Bloqueio de IP**               | ❌ Sim (HTTP 429)      | ❌ Sim (HTTP 429) |
| **Retry automático**             | ✅ 3 tentativas        | ⚠️ Manual       |
| **Múltiplos formatos**           | ❌ JSON apenas         | ✅ VTT/SRT/JSON |
| **Listar legendas**              | ❌ Não                 | ✅ Sim          |
| **Impersonation**                | ❌ Não                 | ✅ Sim (requer deps) |
| **PO tokens**                    | ❌ Não                 | ✅ Sim          |
| **Cookies/sessão**               | ❌ Não                 | ✅ Sim          |
| **Proxy support**                | ❌ Não                 | ✅ Sim          |
| **Integração Python**            | ✅ Biblioteca nativa   | ⚠️ Subprocess   |
| **Tamanho**                      | ✅ ~2 MB               | ❌ ~140 MB      |
| **Velocidade**                   | ✅ Rápida              | ⚠️ Média        |
| **Comunidade**                   | ✅ Ativa               | ✅ Muito ativa  |
| **Documentação**                 | ✅ Simples             | ⚠️ Complexa     |

---

## Recomendações

### Curto Prazo (Agora)

❌ **NÃO migrar para yt-dlp** - Não resolve o bloqueio atual

Razões:
1. Ambas as ferramentas têm HTTP 429
2. yt-dlp adiciona complexidade sem benefício imediato
3. youtube-transcript-api já está integrado e funcionando (com fallback HTML)

### Médio Prazo (Próximas semanas)

✅ **Melhorar youtube-transcript-api existente**:

1. **Exponential backoff** mais agressivo
   ```python
   retries=5, delays=[2, 5, 10, 20, 40]  # Total: 77 segundos
   ```

2. **Validação melhorada** de transcrições
   ```python
   if len(transcript_text) < 300:
       # Considerar falha, tentar alternativas
   ```

3. **Detecção de bloqueio permanente**
   ```python
   if "429" in error and attempts > 3:
       logger.warn("IP blocked, using HTML fallback")
   ```

### Longo Prazo (Futuro)

✅ **Considerar yt-dlp com features avançadas**:

**Cenário 1: PO Token Implementation**
```bash
yt-dlp --extractor-args "youtube:po_token=web.gvs+XXX" ...
```
- Requer automação de navegador (Puppeteer)
- Geração periódica de tokens
- Complexidade: Alta
- Viabilidade: Média

**Cenário 2: Proxy Rotation**
```bash
yt-dlp --proxy "http://proxy-pool:8080" ...
```
- Requer serviço de proxy rotativo
- Custo adicional
- Complexidade: Média
- Viabilidade: Alta (se orçamento permitir)

**Cenário 3: Impersonation + Cookies**
```bash
yt-dlp --cookies cookies.txt --impersonate chrome ...
```
- Requer curl-impersonate
- Cookies de sessão autenticada
- Complexidade: Alta
- Viabilidade: Média

---

## Alternativas Adicionais

### 1. YouTube Data API v3 (Oficial) ⭐ RECOMENDADO

**Vantagens**:
- ✅ API oficial do Google
- ✅ Quota generosa (10,000 units/dia)
- ✅ Sem bloqueio de IP
- ✅ Documentação completa
- ✅ SDKs oficiais

**Desvantagens**:
- ❌ Requer API key
- ❌ Requer projeto Google Cloud
- ❌ Custos para quota extra

**Implementação**:
```typescript
// apps/api/src/services/youtube-official-api.ts
import { google } from 'googleapis';

const youtube = google.youtube({
  version: 'v3',
  auth: process.env.GOOGLE_API_KEY
});

const captions = await youtube.captions.list({
  part: ['snippet'],
  videoId: videoId
});

const transcript = await youtube.captions.download({
  id: captions.data.items[0].id,
  tfmt: 'vtt'  // or 'srt'
});
```

**Custo estimado**:
- API key: Grátis
- 10,000 units/dia: Grátis
- Acima de 10,000: ~$1 por 1,000 units

### 2. Gemini Vision API (Já temos!)

**Uso atual**: Extração de imagens/PDFs

**Novo uso**: Transcrição de vídeo (experimental)

```typescript
// Usar Gemini para transcrever áudio do vídeo
const audioUrl = await downloadYouTubeAudio(videoId);
const transcription = await gemini.transcribeAudio(audioUrl);
```

**Vantagens**:
- ✅ Já integrado no Supermemory
- ✅ Sem bloqueio de IP
- ✅ Multimodal (áudio + vídeo)

**Desvantagens**:
- ❌ Requer download do áudio (bloqueado também!)
- ❌ Custo por minuto de áudio
- ❌ Mais lento que legendas prontas

### 3. Serviços Third-Party

**Opções**:
- RapidAPI YouTube Transcript
- Apify YouTube Scraper
- ScraperAPI

**Vantagens**:
- ✅ Sem bloqueio (usam IPs residenciais)
- ✅ API simples
- ✅ Manutenção terceirizada

**Desvantagens**:
- ❌ Custo mensal
- ❌ Dependência externa
- ❌ Rate limits

---

## Conclusão

### Para o Problema Atual (Bloqueio de IP)

**yt-dlp NÃO é a solução imediata** porque:
1. Sofre o mesmo bloqueio HTTP 429
2. Adiciona complexidade sem benefício
3. Requer PO tokens/impersonation para contornar (complexo)

### Para o Futuro

**yt-dlp TEM potencial** com:
1. PO token implementation (médio prazo)
2. Proxy rotation (se houver orçamento)
3. Features avançadas (impersonation, cookies)

### Melhor Caminho Agora

**Opção 1: Melhorar youtube-transcript-api existente** (✅ RECOMENDADO)
- Exponential backoff agressivo
- Validação melhorada
- Logs detalhados
- **Esforço**: Baixo
- **Impacto**: Médio

**Opção 2: YouTube Data API v3** (⭐ MELHOR LONG-TERM)
- API oficial, sem bloqueios
- Requer API key (grátis até 10k requests/dia)
- **Esforço**: Médio
- **Impacto**: Alto

**Opção 3: Fallback para HTML parsing** (já existe!)
- MarkItDown já faz isso
- Melhorar detecção de conteúdo útil
- **Esforço**: Baixo
- **Impacto**: Baixo

---

## Próximos Passos (Task 2.2+)

Com base nesta análise, recomendo:

1. ✅ **Task 2.2**: Melhorar retry logic do youtube-transcript-api
   - Exponential backoff: 2s → 5s → 10s → 20s → 40s
   - Total: 5 tentativas, ~77 segundos

2. ✅ **Task 2.3**: Implementar validação robusta
   - Comprimento mínimo: 300 chars
   - Detectar HTML parsing vs transcript real
   - Retornar erro claro ao usuário

3. ⭐ **Task 2.4 (NOVO)**: Investigar YouTube Data API v3
   - Criar projeto Google Cloud
   - Obter API key
   - Implementar POC de extração oficial
   - **Benefício**: Solução definitiva sem bloqueios

4. ⚠️ **Task 2.5 (Opcional)**: yt-dlp com PO tokens
   - Apenas se YouTube Data API não for viável
   - Requer automação de navegador
   - Complexidade alta

---

## Arquivos Criados

1. **test_ytdlp_poc.py** - POC básico (VTT, SRT, JSON)
2. **test_ytdlp_advanced.py** - POC avançado (múltiplas estratégias)
3. **YTDLP_COMPARISON_REPORT.md** - Este relatório

### Resultados Salvos

```
/tmp/ytdlp_test/          # POC básico (vazio - todos falharam)
/tmp/ytdlp_advanced/      # POC avançado (vazio - todos falharam)
```

### Logs Completos

Ver stdout/stderr dos scripts de teste para análise detalhada.

---

## Referências

1. **yt-dlp GitHub**: https://github.com/yt-dlp/yt-dlp
2. **PO Token Guide**: https://github.com/yt-dlp/yt-dlp/wiki/PO-Token-Guide
3. **Impersonation**: https://github.com/yt-dlp/yt-dlp#impersonation
4. **youtube-transcript-api**: https://github.com/jdepoix/youtube-transcript-api
5. **YouTube Data API v3**: https://developers.google.com/youtube/v3/docs/captions
6. **Google Cloud Console**: https://console.cloud.google.com/

---

**Data**: 2025-11-03
**Status**: ✅ Task 2.1 COMPLETO
**Próximo**: Task 2.2 - Melhorar retry logic
