# MarkItDown Service

REST API service for converting various document formats to Markdown using Microsoft's MarkItDown library.

## Supported Formats

- **Documents**: PDF, DOCX, PPTX, XLSX
- **Images**: PNG, JPEG, GIF, etc. (with EXIF metadata and OCR)
- **Audio**: MP3, WAV, etc. (with transcription)
- **Web**: HTML, URLs, YouTube videos
- **Data**: CSV, JSON, XML
- **Archives**: ZIP files (processes contents)
- **eBooks**: EPUB

## API Endpoints

### Health Check
```bash
GET /health
```

### Convert File
```bash
POST /convert
Content-Type: multipart/form-data

# Body: file field with document
```

### Convert URL
```bash
POST /convert/url
Content-Type: application/json

{
  "url": "https://example.com/document.pdf"
}
```

## Local Development

### Using Docker
```bash
# Build
docker build -t markitdown:latest .

# Run
docker run -p 5000:5000 markitdown:latest
```

### Using Python directly
```bash
# Create virtual environment
python3 -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Run server
python server.py
```

## Testing

```bash
# Health check
curl http://localhost:5000/health

# Convert file
curl -X POST http://localhost:5000/convert \
  -F "file=@document.pdf"

# Convert URL
curl -X POST http://localhost:5000/convert/url \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com"}'
```

## Environment Variables

- `PORT`: Server port (default: 5000)
- `ALLOWED_ORIGINS`: CORS allowed origins (default: *)
- `RAILWAY_ENVIRONMENT`: Set by Railway (enables production mode)

## Railway Deployment

This service is designed to run as part of the Kortix monorepo on Railway.

### Setup
1. Create new Railway service pointing to this directory
2. Set root directory to `apps/markitdown`
3. Configure environment variables
4. Deploy

### Private Networking
The service is accessible internally via:
- `http://markitdown.railway.internal:5000`

Or publicly via the generated Railway URL.

## Architecture

- **Flask**: Lightweight web framework
- **Gunicorn**: Production WSGI server (2 workers)
- **MarkItDown**: Microsoft's document conversion library
- **No temporary files**: Uses streaming API for security

## License

Part of the Kortix project.
