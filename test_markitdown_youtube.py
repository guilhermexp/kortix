#!/usr/bin/env python3
"""
Test script to diagnose MarkItDown YouTube transcription issues
Task 1.1: Direct testing with detailed logging
"""

import sys
import logging
from markitdown import MarkItDown

# Configure detailed logging
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

# Add youtube_transcript_api logger
yt_logger = logging.getLogger('youtube_transcript_api')
yt_logger.setLevel(logging.DEBUG)

def test_youtube_url(url: str):
    """Test MarkItDown with a YouTube URL and capture detailed logs"""
    print(f"\n{'='*60}")
    print(f"Testing URL: {url}")
    print(f"{'='*60}\n")

    try:
        md = MarkItDown()
        result = md.convert(url)

        print("\n✅ SUCCESS!")
        print(f"\nTitle: {result.title if hasattr(result, 'title') else 'N/A'}")
        print(f"\nContent length: {len(result.text_content)} characters")
        print(f"\nFirst 500 chars:\n{result.text_content[:500]}")

        return True

    except Exception as e:
        print(f"\n❌ ERROR: {type(e).__name__}")
        print(f"Message: {str(e)}")
        print(f"\nFull traceback:")
        import traceback
        traceback.print_exc()

        return False

if __name__ == "__main__":
    # Test URLs
    test_urls = [
        "https://www.youtube.com/watch?v=dQw4w9WgXcQ",  # Rick Astley - Never Gonna Give You Up
        "https://www.youtube.com/watch?v=jNQXAC9IVRw",  # Me at the zoo (first YouTube video)
    ]

    # Use provided URL or default test URLs
    if len(sys.argv) > 1:
        test_urls = [sys.argv[1]]

    results = []
    for url in test_urls:
        success = test_youtube_url(url)
        results.append((url, success))

    # Summary
    print(f"\n\n{'='*60}")
    print("TEST SUMMARY")
    print(f"{'='*60}")
    for url, success in results:
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status}: {url}")

    # Exit with error code if any test failed
    sys.exit(0 if all(r[1] for r in results) else 1)
