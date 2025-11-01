#!/usr/bin/env python3
"""
Debug YouTube transcript extraction issue
"""
import sys

# Test 1: Direct youtube-transcript-api test
print("=" * 80)
print("TEST 1: Testing youtube-transcript-api directly")
print("=" * 80)

try:
    from youtube_transcript_api import YouTubeTranscriptApi
    from youtube_transcript_api._errors import TranscriptsDisabled, NoTranscriptFound, VideoUnavailable

    video_id = "5WfBpE3zDtw"

    print(f"Fetching transcripts for video: {video_id}")

    # List available transcripts
    try:
        transcript_list = YouTubeTranscriptApi.list_transcripts(video_id)
        print(f"\n✓ Available transcripts:")

        for transcript in transcript_list:
            print(f"  - Language: {transcript.language} ({transcript.language_code})")
            print(f"    Is generated: {transcript.is_generated}")
            print(f"    Is translatable: {transcript.is_translatable}")

        # Try to get transcript
        print(f"\nAttempting to fetch transcript...")

        # Try multiple strategies
        strategies = [
            ("Auto (any language)", lambda: YouTubeTranscriptApi.get_transcript(video_id)),
            ("Portuguese", lambda: YouTubeTranscriptApi.get_transcript(video_id, languages=['pt', 'pt-BR'])),
            ("English", lambda: YouTubeTranscriptApi.get_transcript(video_id, languages=['en'])),
        ]

        for strategy_name, strategy_func in strategies:
            try:
                print(f"\n  Strategy: {strategy_name}")
                transcript = strategy_func()

                # Combine all text
                full_text = " ".join([entry['text'] for entry in transcript])

                print(f"  ✓ Success!")
                print(f"  Entries: {len(transcript)}")
                print(f"  Characters: {len(full_text)}")
                print(f"  Words: {len(full_text.split())}")
                print(f"\n  First 200 chars: {full_text[:200]}")

                # Save to file
                with open(f'transcript-{strategy_name.replace(" ", "-")}.txt', 'w', encoding='utf-8') as f:
                    f.write(full_text)

                break
            except Exception as e:
                print(f"  ✗ Failed: {type(e).__name__}: {e}")

    except TranscriptsDisabled:
        print("✗ Transcripts are disabled for this video")
    except NoTranscriptFound:
        print("✗ No transcript found for this video")
    except VideoUnavailable:
        print("✗ Video is unavailable")
    except Exception as e:
        print(f"✗ Error: {type(e).__name__}: {e}")
        import traceback
        traceback.print_exc()

except ImportError:
    print("✗ youtube-transcript-api not installed")
    print("  Run: pip install youtube-transcript-api")

# Test 2: Check MarkItDown internals
print("\n" + "=" * 80)
print("TEST 2: Checking MarkItDown version and capabilities")
print("=" * 80)

try:
    import markitdown
    print(f"MarkItDown version: {markitdown.__version__ if hasattr(markitdown, '__version__') else 'unknown'}")

    # Check if YouTube converter is available
    from markitdown import MarkItDown
    md = MarkItDown()

    # Try to inspect the converter
    if hasattr(md, '_page_converters'):
        print(f"\nAvailable page converters: {list(md._page_converters.keys())}")

    if hasattr(md, '_exts'):
        print(f"Available extensions: {list(md._exts.keys())}")

except Exception as e:
    print(f"Error inspecting MarkItDown: {e}")

# Test 3: Test with MarkItDown directly with debugging
print("\n" + "=" * 80)
print("TEST 3: MarkItDown with detailed error capture")
print("=" * 80)

try:
    from markitdown import MarkItDown
    import logging

    # Enable verbose logging
    logging.basicConfig(level=logging.DEBUG)

    md = MarkItDown()
    print(f"Calling convert_url()...")
    result = md.convert_url("https://www.youtube.com/watch?v=5WfBpE3zDtw")

    print(f"\nResult type: {type(result)}")
    print(f"Has text_content: {hasattr(result, 'text_content')}")
    print(f"Has title: {hasattr(result, 'title')}")

    text = result.text_content if hasattr(result, 'text_content') else str(result)
    print(f"\nExtracted {len(text)} characters")

except Exception as e:
    print(f"Error: {type(e).__name__}: {e}")
    import traceback
    traceback.print_exc()

print("\n" + "=" * 80)
print("DIAGNOSIS COMPLETE")
print("=" * 80)
