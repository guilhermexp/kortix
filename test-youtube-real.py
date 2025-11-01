#!/usr/bin/env python3
"""
Test real YouTube video with updated youtube-transcript-api v1.2.3
"""
import time
from youtube_transcript_api import YouTubeTranscriptApi

video_url = "https://www.youtube.com/watch?v=qrpMAGpzulw"
video_id = "qrpMAGpzulw"

print(f"=" * 80)
print(f"Testing YouTube Transcript Extraction")
print(f"Video: {video_url}")
print(f"ID: {video_id}")
print(f"=" * 80)

# Add delay to avoid rate limiting
time.sleep(3)

try:
    ytt_api = YouTubeTranscriptApi()

    print(f"\n1. Listing available transcripts...")
    transcript_list = ytt_api.list(video_id)

    for transcript in transcript_list:
        print(f"  - {transcript.language} ({transcript.language_code})")
        print(f"    Generated: {transcript.is_generated}")

    print(f"\n2. Fetching transcript...")
    result = ytt_api.fetch(video_id, languages=['en'])

    # Convert to text
    if hasattr(result, '__iter__'):
        entries = list(result)
        full_text = " ".join([
            entry.get('text', '') if isinstance(entry, dict) else str(entry)
            for entry in entries
        ])

        print(f"\n✅ SUCCESS!")
        print(f"=" * 80)
        print(f"Entries: {len(entries)}")
        print(f"Characters: {len(full_text)}")
        print(f"Words: {len(full_text.split())}")
        print(f"=" * 80)

        print(f"\n📝 First 500 characters:")
        print(full_text[:500])

        print(f"\n📝 Last 300 characters:")
        print(full_text[-300:])

        # Save
        with open('youtube-real-test.txt', 'w', encoding='utf-8') as f:
            f.write(full_text)

        print(f"\n✅ Saved to: youtube-real-test.txt")

        # Validation
        print(f"\n🔍 Validation:")
        print(f"  Length > 1000: {len(full_text) > 1000} {'✅' if len(full_text) > 1000 else '❌'}")
        print(f"  Has footer pattern: {'[Sobre]' in full_text}")
        print(f"  Likely valid: {len(full_text) > 1000 and '[Sobre]' not in full_text[:1000]}")

    else:
        print(f"❌ Unexpected result type: {type(result)}")

except Exception as e:
    print(f"\n❌ FAILED: {type(e).__name__}")
    print(f"Error: {str(e)[:500]}")

    import traceback
    print(f"\nTraceback:")
    traceback.print_exc()

print(f"\n" + "=" * 80)
print(f"Test complete!")
print(f"=" * 80)
