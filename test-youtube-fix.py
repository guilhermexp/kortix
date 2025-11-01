#!/usr/bin/env python3
"""
Test YouTube transcript extraction with rate limit workarounds
"""
import time
import random
from youtube_transcript_api import YouTubeTranscriptApi
from youtube_transcript_api.formatters import TextFormatter

video_id = "5WfBpE3zDtw"

print("Testing YouTube transcript with workarounds...")
print(f"Video ID: {video_id}")
print("-" * 80)

# Strategy 1: Add delay before request
print("\nStrategy 1: Single request with delay")
time.sleep(2)  # Wait 2 seconds before making request

try:
    transcript = YouTubeTranscriptApi.get_transcript(
        video_id,
        languages=['en'],
        preserve_formatting=True
    )

    # Format as plain text
    formatter = TextFormatter()
    text = formatter.format_transcript(transcript)

    print(f"✓ Success!")
    print(f"Entries: {len(transcript)}")
    print(f"Characters: {len(text)}")
    print(f"Words: {len(text.split())}")
    print(f"\nFirst 500 chars:\n{text[:500]}")

    # Save to file
    with open('transcript-fixed.txt', 'w', encoding='utf-8') as f:
        f.write(text)

    print(f"\n✓ Saved to: transcript-fixed.txt")

except Exception as e:
    print(f"✗ Failed: {type(e).__name__}: {str(e)[:200]}")

# Strategy 2: Check available transcripts first
print("\n" + "=" * 80)
print("Strategy 2: List available transcripts first")
print("=" * 80)

time.sleep(2)  # Rate limit protection

try:
    transcript_list = YouTubeTranscriptApi.list_transcripts(video_id)

    for transcript in transcript_list:
        print(f"\nFound: {transcript.language} ({transcript.language_code})")
        print(f"  Generated: {transcript.is_generated}")

        # Fetch the transcript
        time.sleep(1)  # Small delay between requests

        try:
            data = transcript.fetch()
            full_text = " ".join([entry['text'] for entry in data])

            print(f"  ✓ Fetched successfully")
            print(f"  Characters: {len(full_text)}")
            print(f"  Words: {len(full_text.split())}")

            if len(full_text) > 500:
                # Save this one
                filename = f'transcript-{transcript.language_code}.txt'
                with open(filename, 'w', encoding='utf-8') as f:
                    f.write(full_text)
                print(f"  ✓ Saved to: {filename}")

                # Show preview
                print(f"\n  Preview:")
                print(f"  {full_text[:300]}...")
                break  # Got what we need

        except Exception as e:
            print(f"  ✗ Failed to fetch: {type(e).__name__}")

except Exception as e:
    print(f"✗ Failed: {type(e).__name__}: {str(e)[:200]}")

print("\n" + "=" * 80)
print("Test complete!")
print("=" * 80)
