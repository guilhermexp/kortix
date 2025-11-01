#!/usr/bin/env python3
"""
Test YouTube transcript with youtube-transcript-api v1.2.3 (new API)
"""
import time
from youtube_transcript_api import YouTubeTranscriptApi

video_id = "5WfBpE3zDtw"

print(f"Testing YouTube transcript API v1.2.3")
print(f"Video ID: {video_id}")
print("-" * 80)

# Add delay to avoid rate limiting
time.sleep(2)

try:
    # Strategy 1: Use the new API with .list()
    print("\n1. Listing available transcripts...")
    transcript_list = YouTubeTranscriptApi.list(video_id)

    print(f"Available transcripts:")
    for transcript in transcript_list:
        print(f"  - {transcript.get('language', 'unknown')} ({transcript.get('languageCode', 'unknown')})")
        print(f"    Generated: {transcript.get('isGenerated', False)}")

    # Strategy 2: Fetch transcript with .fetch()
    print(f"\n2. Fetching English transcript...")
    time.sleep(1)

    # Try fetching
    result = YouTubeTranscriptApi.fetch(video_id, languages=['en'])

    if result:
        # Combine all text entries
        entries = result if isinstance(result, list) else []

        if entries:
            full_text = " ".join([
                entry.get('text', '') if isinstance(entry, dict) else str(entry)
                for entry in entries
            ])

            print(f"✓ Success!")
            print(f"Entries: {len(entries)}")
            print(f"Characters: {len(full_text)}")
            print(f"Words: {len(full_text.split())}")

            print(f"\nFirst 500 chars:\n{full_text[:500]}")

            # Save to file
            with open('transcript-v1.2.3.txt', 'w', encoding='utf-8') as f:
                f.write(full_text)

            print(f"\n✓ Saved to: transcript-v1.2.3.txt")
        else:
            print(f"✗ No entries found in result")
            print(f"Result type: {type(result)}")
            print(f"Result: {result}")
    else:
        print(f"✗ No result returned")

except AttributeError as e:
    print(f"✗ API Error: {e}")
    print(f"\nTrying alternative approach...")

    # Fallback: Direct method access
    try:
        api = YouTubeTranscriptApi()
        print(f"Methods: {[m for m in dir(api) if not m.startswith('_')]}")
    except Exception as e2:
        print(f"✗ Failed: {e2}")

except Exception as e:
    print(f"✗ Failed: {type(e).__name__}: {str(e)[:300]}")
    import traceback
    traceback.print_exc()

print("\n" + "=" * 80)
print("Test complete!")
print("=" * 80)
