#!/usr/bin/env python3
"""
Test YouTube transcript with youtube-transcript-api v1.2.3 (correct API usage)
"""
import time
from youtube_transcript_api import YouTubeTranscriptApi

video_id = "5WfBpE3zDtw"

print(f"Testing YouTube Transcript API v1.2.3")
print(f"Video ID: {video_id}")
print("-" * 80)

# Add delay to avoid rate limiting
time.sleep(2)

try:
    # Create API instance
    ytt_api = YouTubeTranscriptApi()

    # Strategy 1: List available transcripts
    print("\n1. Listing available transcripts...")
    transcript_list = ytt_api.list(video_id)

    print(f"Available transcripts:")
    for transcript in transcript_list:
        print(f"  - {transcript.language} ({transcript.language_code})")
        print(f"    Is generated: {transcript.is_generated}")
        print(f"    Translation languages: {len(transcript.translation_languages)} available")

    # Strategy 2: Fetch the English transcript directly
    print(f"\n2. Fetching English transcript using .fetch()...")
    time.sleep(1)

    result = ytt_api.fetch(video_id, languages=['en'], preserve_formatting=False)

    # The result is a FetchedTranscript object
    print(f"Result type: {type(result)}")

    # Convert to text
    if hasattr(result, 'fetch_transcript'):
        entries = result.fetch_transcript()
    elif hasattr(result, 'entries'):
        entries = result.entries
    elif isinstance(result, list):
        entries = result
    else:
        # Try to iterate
        entries = list(result)

    if entries:
        full_text = " ".join([
            entry.get('text', '') if isinstance(entry, dict) else str(entry)
            for entry in entries
        ])

        print(f"\n✓ SUCCESS!")
        print(f"Entries: {len(entries)}")
        print(f"Characters: {len(full_text)}")
        print(f"Words: {len(full_text.split())}")

        print(f"\nFirst 500 chars:")
        print(full_text[:500])

        print(f"\nLast 200 chars:")
        print(full_text[-200:])

        # Save to file
        with open('transcript-working.txt', 'w', encoding='utf-8') as f:
            f.write(full_text)

        print(f"\n✓ Full transcript saved to: transcript-working.txt")
    else:
        print(f"✗ No entries found")
        print(f"Result: {result}")

except Exception as e:
    print(f"\n✗ FAILED: {type(e).__name__}")
    print(f"Message: {str(e)[:500]}")

    import traceback
    print("\n--- Full traceback ---")
    traceback.print_exc()

print("\n" + "=" * 80)
print("Test complete!")
print("=" * 80)
