#!/usr/bin/env python3
"""
Test script to debug YouTube subtitle extraction with MarkItDown
"""
import json
from markitdown import MarkItDown

# Test URL from user's report
test_url = "https://www.youtube.com/watch?v=5WfBpE3zDtw"

print(f"Testing MarkItDown YouTube extraction...")
print(f"URL: {test_url}")
print("-" * 80)

try:
    md = MarkItDown()
    result = md.convert_url(test_url)

    # Extract text content
    text_content = result.text_content if hasattr(result, 'text_content') else str(result)
    title = result.title if hasattr(result, 'title') else "Unknown"

    print(f"\n✓ Extraction successful!")
    print(f"\nTitle: {title}")
    print(f"Characters: {len(text_content)}")
    print(f"Words: {len(text_content.split())}")
    print(f"Lines: {len(text_content.splitlines())}")

    print(f"\n--- First 500 characters ---")
    print(text_content[:500])

    print(f"\n--- Last 500 characters ---")
    print(text_content[-500:])

    # Save full content to file for inspection
    with open('youtube-transcript-full.txt', 'w', encoding='utf-8') as f:
        f.write(text_content)
    print(f"\n✓ Full transcript saved to: youtube-transcript-full.txt")

    # Check for common truncation patterns
    if "..." in text_content[-100:]:
        print(f"\n⚠️  WARNING: Transcript might be truncated (ellipsis found at end)")

    # Analyze content structure
    print(f"\n--- Content Analysis ---")
    print(f"Contains timestamps: {'[' in text_content and ']' in text_content}")
    print(f"Starts with title: {text_content.startswith('#')}")

except Exception as e:
    print(f"\n✗ Extraction failed!")
    print(f"Error: {str(e)}")
    import traceback
    traceback.print_exc()

print("\n" + "=" * 80)
