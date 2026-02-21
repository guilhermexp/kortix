# YouTube Video Transcription - Como Funciona

## Visao Geral

O sistema extrai transcrições de videos do YouTube sem necessidade de API keys ou autenticacao. Usa as APIs publicas do YouTube para buscar legendas (captions) em formato VTT, com fallback para a biblioteca Python `youtube-transcript-api`.

## Fluxo Completo

```
URL do YouTube
    |
    v
[1] Parse do Video ID
    |  Suporta: youtube.com/watch?v=, youtu.be/, /embed/, /shorts/, /v/
    |
    v
[2] Extrair Titulo
    |  Metodo 1: og:title da pagina HTML do YouTube
    |  Metodo 2: twitter:title meta tag
    |  Metodo 3: <title> tag (remove " - YouTube")
    |  Metodo 4: oEmbed API (https://www.youtube.com/oembed?url=...&format=json)
    |
    v
[3] Buscar Transcricao - Passo 1: VTT Direto (Fast Path)
    |  Tenta idiomas hardcoded: en, en-US, pt, pt-BR
    |  Para cada idioma tenta:
    |    - Legendas oficiais (kind=normal)
    |    - Legendas auto-geradas (kind=asr)
    |  API: https://www.youtube.com/api/timedtext?v={id}&lang={lang}&fmt=vtt
    |  Minimo: 100 caracteres
    |
    v (se Passo 1 falhar)
[4] Buscar Transcricao - Passo 2: Descobrir Idiomas
    |  API: https://www.youtube.com/api/timedtext?type=list&v={id}
    |  Retorna XML com <track lang_code="..."> disponiveis
    |  Tenta cada idioma novo encontrado (oficial + ASR)
    |
    v (se Passo 2 falhar)
[5] Buscar Transcricao - Passo 3: Python Fallback
    |  Usa youtube-transcript-api==1.2.3 via subprocess
    |  Gera script Python dinamicamente e executa
    |  Mais robusto para casos edge (geo-restricted, etc)
    |
    v
[6] Validacao
    |  Minimo 100 chars para transcript
    |  Minimo 300 chars para validacao de qualidade
    |  Detecta se retornou apenas footer do YouTube (falso positivo)
    |
    v
[7] Output: Markdown com titulo + transcricao
```

## APIs Publicas Utilizadas

### 1. Timedtext API (Principal)

Busca legendas em formato WebVTT diretamente do YouTube.

```
GET https://www.youtube.com/api/timedtext?v={videoId}&lang={lang}&fmt=vtt
GET https://www.youtube.com/api/timedtext?v={videoId}&lang={lang}&fmt=vtt&kind=asr
```

- Nao requer autenticacao
- Retorna VTT que eh parseado para texto puro
- Header necessario: `User-Agent: Mozilla/5.0`

### 2. Timedtext List API

Descobre quais idiomas de legenda estao disponiveis.

```
GET https://www.youtube.com/api/timedtext?type=list&v={videoId}
```

Retorna XML com elementos `<track lang_code="en" .../>`.

### 3. oEmbed API

Busca titulo do video (fallback).

```
GET https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v={videoId}&format=json
```

Retorna JSON com `{ title, author_name, thumbnail_url, ... }`.

## Parsing do VTT

O formato WebVTT retornado eh processado assim:

1. Remove header `WEBVTT`
2. Remove numeros de cue (linhas so com digitos)
3. Remove timestamps (`00:00:00.000 --> 00:00:05.000`)
4. Junta todas as linhas de texto restantes
5. Decodifica entidades HTML (`&amp;` -> `&`, etc)
6. Normaliza espacos

## Python Fallback (youtube-transcript-api)

Quando o VTT direto falha, executa um script Python via subprocess:

```python
from youtube_transcript_api import YouTubeTranscriptApi

api = YouTubeTranscriptApi()
transcript = api.fetch(video_id)
full_text = ' '.join([e.text for e in transcript])
```

**Dependencias:**
- `youtube-transcript-api==1.2.3`
- `requests` (para extrair titulo da pagina)

**Quando usar:** O YouTube pode bloquear requests diretos ao timedtext dependendo de IP/regiao. A biblioteca Python tem mecanismos mais sofisticados para lidar com isso.

## Formatos de URL Suportados

| Formato | Exemplo |
|---------|---------|
| Watch | `https://www.youtube.com/watch?v=dQw4w9WgXcQ` |
| Short URL | `https://youtu.be/dQw4w9WgXcQ` |
| Embed | `https://www.youtube.com/embed/dQw4w9WgXcQ` |
| Shorts | `https://www.youtube.com/shorts/dQw4w9WgXcQ` |
| V path | `https://www.youtube.com/v/dQw4w9WgXcQ` |
| Com parametros | `https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=441s` |
| Video ID direto | `dQw4w9WgXcQ` |

## Limitacoes Conhecidas

- Videos privados: nao tem legenda acessivel
- Videos sem legenda: nenhum metodo funciona (retorna null)
- Rate limiting: YouTube pode bloquear muitas requests seguidas
- Legendas auto-geradas (ASR): qualidade varia bastante dependendo do audio
- Videos muito novos: legendas auto-geradas podem demorar para ficar disponiveis
