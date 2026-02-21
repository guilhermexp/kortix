# Prompt Reutilizavel: Extrair Transcricao de Video do YouTube

Use este prompt com qualquer LLM que tenha acesso a ferramentas de execucao de codigo (Claude Code, ChatGPT Code Interpreter, Cursor, etc).

---

## Prompt

```
Extraia a transcricao completa do video do YouTube: {URL}

Use o seguinte metodo, em ordem de prioridade:

### Metodo 1: VTT Direto (sem dependencias)

Faca requests HTTP para a API publica do YouTube timedtext:

1. Tente buscar legendas nos idiomas: en, en-US, pt, pt-BR
   Para cada idioma, tente DUAS variantes:
   - Oficial: GET https://www.youtube.com/api/timedtext?v={VIDEO_ID}&lang={LANG}&fmt=vtt
   - Auto-gerada (ASR): GET https://www.youtube.com/api/timedtext?v={VIDEO_ID}&lang={LANG}&fmt=vtt&kind=asr

   Use header: User-Agent: Mozilla/5.0

2. Se nenhum idioma hardcoded funcionar, descubra os idiomas disponiveis:
   GET https://www.youtube.com/api/timedtext?type=list&v={VIDEO_ID}
   Parse o XML retornado para extrair lang_code de cada <track>
   Tente cada idioma encontrado (oficial + ASR)

3. Para parsear o VTT retornado:
   - Remova a linha "WEBVTT"
   - Remova linhas que sao apenas numeros (cue numbers)
   - Remova linhas de timestamp (formato: 00:00:00.000 --> 00:00:05.000)
   - Junte as linhas restantes com espaco
   - Decodifique entidades HTML (&amp; -> &, &lt; -> <, etc)

### Metodo 2: Python youtube-transcript-api (fallback)

Se o Metodo 1 falhar, use Python:

```python
pip install youtube-transcript-api==1.2.3

from youtube_transcript_api import YouTubeTranscriptApi

api = YouTubeTranscriptApi()
transcript = api.fetch("{VIDEO_ID}")
text = ' '.join([entry.text for entry in transcript])
print(text)
```

### Titulo do Video

Para extrair o titulo, use a oEmbed API (nao precisa de auth):
GET https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v={VIDEO_ID}&format=json

O campo "title" do JSON retornado contem o titulo.

### Formatos de URL suportados

Extraia o VIDEO_ID de qualquer um destes formatos:
- https://www.youtube.com/watch?v=VIDEO_ID
- https://youtu.be/VIDEO_ID
- https://www.youtube.com/embed/VIDEO_ID
- https://www.youtube.com/shorts/VIDEO_ID

O VIDEO_ID tem sempre 11 caracteres alfanumericos (incluindo - e _).

### Output esperado

Retorne no formato:
- Titulo: {titulo do video}
- Idioma da legenda: {idioma encontrado}
- Metodo usado: {VTT direto | youtube-transcript-api}
- Transcricao completa em texto corrido
```

---

## Exemplo de Uso Rapido (curl)

```bash
# Extrair video ID da URL
VIDEO_ID="dQw4w9WgXcQ"

# Tentar legendas em ingles (oficial)
curl -s -H "User-Agent: Mozilla/5.0" \
  "https://www.youtube.com/api/timedtext?v=${VIDEO_ID}&lang=en&fmt=vtt"

# Tentar legendas auto-geradas em ingles
curl -s -H "User-Agent: Mozilla/5.0" \
  "https://www.youtube.com/api/timedtext?v=${VIDEO_ID}&lang=en&fmt=vtt&kind=asr"

# Listar idiomas disponiveis
curl -s -H "User-Agent: Mozilla/5.0" \
  "https://www.youtube.com/api/timedtext?type=list&v=${VIDEO_ID}"

# Pegar titulo
curl -s "https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${VIDEO_ID}&format=json" | jq .title
```

## Exemplo Python Standalone

```python
"""
YouTube Transcript Extractor - Zero API keys needed
"""
import re
import json
from urllib.request import urlopen, Request
from html import unescape

def extract_video_id(url: str) -> str | None:
    patterns = [
        r'(?:youtube\.com/watch\?v=|youtu\.be/|youtube\.com/embed/|youtube\.com/shorts/)([a-zA-Z0-9_-]{11})',
    ]
    for p in patterns:
        m = re.search(p, url)
        if m:
            return m.group(1)
    if re.match(r'^[a-zA-Z0-9_-]{11}$', url):
        return url
    return None

def fetch_vtt(video_id: str, lang: str, asr: bool = False) -> str | None:
    url = f"https://www.youtube.com/api/timedtext?v={video_id}&lang={lang}&fmt=vtt"
    if asr:
        url += "&kind=asr"
    try:
        req = Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urlopen(req, timeout=10) as resp:
            vtt = resp.read().decode("utf-8")
        lines = []
        for line in vtt.split("\n"):
            line = line.strip()
            if not line or line == "WEBVTT":
                continue
            if re.match(r'^\d+$', line):
                continue
            if re.match(r'\d{2}:\d{2}:\d{2}\.\d{3} -->', line):
                continue
            lines.append(line)
        text = unescape(" ".join(lines)).strip()
        return text if len(text) >= 100 else None
    except Exception:
        return None

def get_title(video_id: str) -> str:
    try:
        url = f"https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v={video_id}&format=json"
        with urlopen(url, timeout=5) as resp:
            data = json.loads(resp.read())
        return data.get("title", f"YouTube Video {video_id}")
    except Exception:
        return f"YouTube Video {video_id}"

def get_available_langs(video_id: str) -> list[str]:
    try:
        url = f"https://www.youtube.com/api/timedtext?type=list&v={video_id}"
        req = Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urlopen(req, timeout=5) as resp:
            xml = resp.read().decode("utf-8")
        return re.findall(r'lang_code="([^"]+)"', xml)
    except Exception:
        return []

def transcribe(url: str) -> dict:
    video_id = extract_video_id(url)
    if not video_id:
        raise ValueError(f"Could not extract video ID from: {url}")

    title = get_title(video_id)

    # Step 1: Try hardcoded languages
    for lang in ["en", "en-US", "pt", "pt-BR"]:
        for asr in [False, True]:
            text = fetch_vtt(video_id, lang, asr)
            if text:
                return {"title": title, "lang": lang, "method": "vtt", "asr": asr, "transcript": text}

    # Step 2: Discover languages
    langs = get_available_langs(video_id)
    for lang in langs:
        if lang in ["en", "en-US", "pt", "pt-BR"]:
            continue
        for asr in [False, True]:
            text = fetch_vtt(video_id, lang, asr)
            if text:
                return {"title": title, "lang": lang, "method": "vtt", "asr": asr, "transcript": text}

    # Step 3: Python fallback
    try:
        from youtube_transcript_api import YouTubeTranscriptApi
        api = YouTubeTranscriptApi()
        transcript = api.fetch(video_id)
        text = " ".join([e.text for e in transcript])
        if len(text) >= 100:
            return {"title": title, "lang": "auto", "method": "youtube-transcript-api", "asr": False, "transcript": text}
    except Exception:
        pass

    return {"title": title, "lang": None, "method": None, "transcript": None, "error": "No transcript available"}

if __name__ == "__main__":
    import sys
    url = sys.argv[1] if len(sys.argv) > 1 else input("YouTube URL: ")
    result = transcribe(url)
    print(f"\nTitle: {result['title']}")
    print(f"Language: {result.get('lang', 'N/A')}")
    print(f"Method: {result.get('method', 'N/A')}")
    print(f"ASR: {result.get('asr', False)}")
    if result.get("transcript"):
        print(f"Length: {len(result['transcript'])} chars")
        print(f"\n--- Transcript ---\n{result['transcript'][:2000]}...")
    else:
        print(f"Error: {result.get('error', 'Unknown')}")
```

Uso:
```bash
python transcript.py "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
```
