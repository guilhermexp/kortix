#!/usr/bin/env python3
"""
MarkItDown REST API Server
Converts various document formats to Markdown
"""

import io
import os
import traceback
from flask import Flask, request, jsonify
from flask_cors import CORS
from markitdown import MarkItDown

# Initialize Flask app
app = Flask(__name__)

# Configure CORS
allowed_origins = os.getenv('ALLOWED_ORIGINS', '*')
if allowed_origins == '*':
    CORS(app)
else:
    origins = [origin.strip() for origin in allowed_origins.split(',')]
    CORS(app, origins=origins)

# Initialize MarkItDown
md_converter = MarkItDown()

# Configure port
PORT = int(os.getenv('PORT', 5000))


@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'service': 'markitdown',
        'version': '0.1.3'
    }), 200


@app.route('/convert', methods=['POST'])
def convert_to_markdown():
    """
    Convert uploaded file to Markdown
    
    Accepts:
    - multipart/form-data with 'file' field
    - Raw file in request body with Content-Type header
    
    Returns:
    - JSON with 'markdown' and 'metadata' fields
    """
    try:
        # Get file from multipart upload or raw body
        if 'file' in request.files:
            file = request.files['file']
            filename = file.filename or 'document'
            file_content = file.read()
        elif request.data:
            filename = request.headers.get('X-Filename', 'document')
            file_content = request.data
        else:
            return jsonify({
                'error': 'No file provided',
                'message': 'Send file via multipart/form-data or raw body'
            }), 400

        # Convert to markdown using streaming API (no temp files)
        with io.BytesIO(file_content) as stream:
            result = md_converter.convert_stream(stream)
        
        # Extract result
        markdown_text = result.text_content if hasattr(result, 'text_content') else str(result)
        
        # Build metadata
        metadata = {
            'filename': filename,
            'size_bytes': len(file_content),
            'markdown_length': len(markdown_text),
        }
        
        # Add any additional metadata from result
        if hasattr(result, 'title') and result.title:
            metadata['title'] = result.title
        
        return jsonify({
            'markdown': markdown_text,
            'metadata': metadata
        }), 200
        
    except Exception as e:
        app.logger.error(f"Conversion error: {str(e)}")
        app.logger.error(traceback.format_exc())
        
        return jsonify({
            'error': 'Conversion failed',
            'message': str(e),
            'type': type(e).__name__
        }), 500


@app.route('/convert/url', methods=['POST'])
def convert_url_to_markdown():
    """
    Convert URL content to Markdown
    
    Accepts:
    - JSON with 'url' field
    
    Returns:
    - JSON with 'markdown' and 'metadata' fields
    """
    try:
        data = request.get_json()
        
        if not data or 'url' not in data:
            return jsonify({
                'error': 'No URL provided',
                'message': 'Send JSON with "url" field'
            }), 400
        
        url = data['url']
        
        # Convert URL to markdown
        result = md_converter.convert(url)
        
        # Extract result
        markdown_text = result.text_content if hasattr(result, 'text_content') else str(result)
        
        # Build metadata
        metadata = {
            'url': url,
            'markdown_length': len(markdown_text),
        }
        
        if hasattr(result, 'title') and result.title:
            metadata['title'] = result.title
        
        return jsonify({
            'markdown': markdown_text,
            'metadata': metadata
        }), 200
        
    except Exception as e:
        app.logger.error(f"URL conversion error: {str(e)}")
        app.logger.error(traceback.format_exc())
        
        return jsonify({
            'error': 'URL conversion failed',
            'message': str(e),
            'type': type(e).__name__
        }), 500


@app.route('/', methods=['GET'])
def index():
    """Root endpoint with API info"""
    return jsonify({
        'service': 'MarkItDown REST API',
        'version': '0.1.3',
        'endpoints': {
            'GET /health': 'Health check',
            'POST /convert': 'Convert file to markdown (multipart/form-data)',
            'POST /convert/url': 'Convert URL to markdown (JSON with url field)',
            'GET /': 'This info page'
        },
        'supported_formats': [
            'PDF', 'DOCX', 'PPTX', 'XLSX',
            'Images (with EXIF/OCR)',
            'Audio (with transcription)',
            'HTML', 'CSV', 'JSON', 'XML',
            'EPUB', 'ZIP',
            'YouTube URLs'
        ]
    }), 200


if __name__ == '__main__':
    print(f"🚀 MarkItDown server starting on port {PORT}")
    print(f"📝 Supported formats: PDF, DOCX, PPTX, XLSX, Images, Audio, HTML, and more")
    print(f"🔗 CORS enabled for: {allowed_origins}")
    
    # Use gunicorn in production (Railway), Flask dev server for local testing
    if os.getenv('RAILWAY_ENVIRONMENT'):
        # Railway will use gunicorn via Procfile
        from gunicorn.app.base import BaseApplication
        
        class StandaloneApplication(BaseApplication):
            def __init__(self, app, options=None):
                self.options = options or {}
                self.application = app
                super().__init__()

            def load_config(self):
                for key, value in self.options.items():
                    self.cfg.set(key.lower(), value)

            def load(self):
                return self.application
        
        options = {
            'bind': f'0.0.0.0:{PORT}',
            'workers': 2,
            'worker_class': 'sync',
            'timeout': 120,
            'keepalive': 5,
            'accesslog': '-',
            'errorlog': '-',
            'loglevel': 'info'
        }
        
        StandaloneApplication(app, options).run()
    else:
        # Local development
        app.run(host='0.0.0.0', port=PORT, debug=True)
