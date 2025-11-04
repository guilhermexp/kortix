#!/usr/bin/env python3
"""
POC: yt-dlp para extração de transcrições do YouTube
Task 2.1: Investigar yt-dlp como alternativa
"""

import subprocess
import json
import os
import time
from pathlib import Path

class YtDlpTranscriptExtractor:
    """POC class for extracting YouTube transcripts using yt-dlp"""

    def __init__(self, output_dir="/tmp/ytdlp_test"):
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(exist_ok=True)

    def extract_transcript_vtt(self, video_url: str) -> dict:
        """Extract transcript in VTT format"""
        print(f"\n{'='*60}")
        print(f"Testing VTT format: {video_url}")
        print(f"{'='*60}")

        video_id = video_url.split("v=")[1] if "v=" in video_url else "unknown"
        output_file = self.output_dir / f"{video_id}_vtt"

        cmd = [
            "yt-dlp",
            "--write-auto-sub",      # Write automatic captions
            "--sub-lang", "en",      # English subtitles
            "--sub-format", "vtt",   # VTT format
            "--skip-download",       # Don't download video
            "--output", str(output_file),
            video_url
        ]

        try:
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=30
            )

            vtt_file = Path(str(output_file) + ".en.vtt")

            if vtt_file.exists():
                content = vtt_file.read_text()
                # Clean VTT content (remove timing)
                lines = content.split('\n')
                text_lines = [
                    line for line in lines
                    if line and not line.startswith('WEBVTT')
                    and '-->' not in line
                    and not line.strip().isdigit()
                ]
                clean_text = ' '.join(text_lines)

                print(f"✅ SUCCESS!")
                print(f"File size: {vtt_file.stat().st_size} bytes")
                print(f"Clean text length: {len(clean_text)} characters")
                print(f"First 300 chars:\n{clean_text[:300]}")

                return {
                    "success": True,
                    "format": "vtt",
                    "file": str(vtt_file),
                    "size": vtt_file.stat().st_size,
                    "text": clean_text,
                    "length": len(clean_text),
                    "stdout": result.stdout,
                    "stderr": result.stderr
                }
            else:
                print(f"❌ FAILED - VTT file not created")
                print(f"stdout: {result.stdout}")
                print(f"stderr: {result.stderr}")

                return {
                    "success": False,
                    "format": "vtt",
                    "error": "VTT file not created",
                    "stdout": result.stdout,
                    "stderr": result.stderr
                }

        except Exception as e:
            print(f"❌ ERROR: {e}")
            return {
                "success": False,
                "format": "vtt",
                "error": str(e)
            }

    def extract_transcript_json(self, video_url: str) -> dict:
        """Extract transcript in JSON format"""
        print(f"\n{'='*60}")
        print(f"Testing JSON format: {video_url}")
        print(f"{'='*60}")

        video_id = video_url.split("v=")[1] if "v=" in video_url else "unknown"
        output_file = self.output_dir / f"{video_id}_json"

        cmd = [
            "yt-dlp",
            "--write-auto-sub",
            "--sub-lang", "en",
            "--sub-format", "json3",  # JSON format
            "--skip-download",
            "--output", str(output_file),
            video_url
        ]

        try:
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=30
            )

            json_file = Path(str(output_file) + ".en.json3")

            if json_file.exists():
                content = json_file.read_text()
                data = json.loads(content)

                # Extract text from JSON
                if "events" in data:
                    text_parts = []
                    for event in data["events"]:
                        if "segs" in event:
                            for seg in event["segs"]:
                                if "utf8" in seg:
                                    text_parts.append(seg["utf8"])
                    clean_text = ' '.join(text_parts)
                else:
                    clean_text = ""

                print(f"✅ SUCCESS!")
                print(f"File size: {json_file.stat().st_size} bytes")
                print(f"Clean text length: {len(clean_text)} characters")
                print(f"First 300 chars:\n{clean_text[:300]}")

                return {
                    "success": True,
                    "format": "json",
                    "file": str(json_file),
                    "size": json_file.stat().st_size,
                    "text": clean_text,
                    "length": len(clean_text),
                    "stdout": result.stdout,
                    "stderr": result.stderr
                }
            else:
                print(f"❌ FAILED - JSON file not created")
                print(f"stdout: {result.stdout}")
                print(f"stderr: {result.stderr}")

                return {
                    "success": False,
                    "format": "json",
                    "error": "JSON file not created",
                    "stdout": result.stdout,
                    "stderr": result.stderr
                }

        except Exception as e:
            print(f"❌ ERROR: {e}")
            return {
                "success": False,
                "format": "json",
                "error": str(e)
            }

    def extract_transcript_srt(self, video_url: str) -> dict:
        """Extract transcript in SRT format"""
        print(f"\n{'='*60}")
        print(f"Testing SRT format: {video_url}")
        print(f"{'='*60}")

        video_id = video_url.split("v=")[1] if "v=" in video_url else "unknown"
        output_file = self.output_dir / f"{video_id}_srt"

        cmd = [
            "yt-dlp",
            "--write-auto-sub",
            "--sub-lang", "en",
            "--sub-format", "srt",
            "--skip-download",
            "--output", str(output_file),
            video_url
        ]

        try:
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=30
            )

            srt_file = Path(str(output_file) + ".en.srt")

            if srt_file.exists():
                content = srt_file.read_text()
                # Clean SRT content (remove timing and numbers)
                lines = content.split('\n')
                text_lines = [
                    line for line in lines
                    if line and not line.strip().isdigit()
                    and '-->' not in line
                ]
                clean_text = ' '.join(text_lines)

                print(f"✅ SUCCESS!")
                print(f"File size: {srt_file.stat().st_size} bytes")
                print(f"Clean text length: {len(clean_text)} characters")
                print(f"First 300 chars:\n{clean_text[:300]}")

                return {
                    "success": True,
                    "format": "srt",
                    "file": str(srt_file),
                    "size": srt_file.stat().st_size,
                    "text": clean_text,
                    "length": len(clean_text),
                    "stdout": result.stdout,
                    "stderr": result.stderr
                }
            else:
                print(f"❌ FAILED - SRT file not created")
                print(f"stdout: {result.stdout}")
                print(f"stderr: {result.stderr}")

                return {
                    "success": False,
                    "format": "srt",
                    "error": "SRT file not created",
                    "stdout": result.stdout,
                    "stderr": result.stderr
                }

        except Exception as e:
            print(f"❌ ERROR: {e}")
            return {
                "success": False,
                "format": "srt",
                "error": str(e)
            }

    def cleanup(self):
        """Clean up temporary files"""
        import shutil
        if self.output_dir.exists():
            shutil.rmtree(self.output_dir)
            print(f"\n✅ Cleaned up: {self.output_dir}")


def main():
    """Main test function"""
    print("="*60)
    print("yt-dlp POC - YouTube Transcript Extraction")
    print("Task 2.1: Investigar yt-dlp como alternativa")
    print("="*60)

    # Test URLs (same as diagnosis)
    test_urls = [
        "https://www.youtube.com/watch?v=dQw4w9WgXcQ",  # Rick Astley
        "https://www.youtube.com/watch?v=jNQXAC9IVRw",  # Me at the zoo
    ]

    extractor = YtDlpTranscriptExtractor()
    results = []

    for url in test_urls:
        video_id = url.split("v=")[1] if "v=" in url else "unknown"
        print(f"\n\n{'#'*60}")
        print(f"# Testing Video: {video_id}")
        print(f"{'#'*60}")

        # Test VTT format
        vtt_result = extractor.extract_transcript_vtt(url)
        results.append(("VTT", video_id, vtt_result))
        time.sleep(2)  # Brief delay

        # Test JSON format
        json_result = extractor.extract_transcript_json(url)
        results.append(("JSON", video_id, json_result))
        time.sleep(2)

        # Test SRT format
        srt_result = extractor.extract_transcript_srt(url)
        results.append(("SRT", video_id, srt_result))
        time.sleep(2)

    # Summary
    print(f"\n\n{'='*60}")
    print("SUMMARY")
    print(f"{'='*60}\n")

    for format_type, video_id, result in results:
        status = "✅ SUCCESS" if result["success"] else "❌ FAILED"
        length = result.get("length", 0) if result["success"] else 0
        print(f"{status} | {format_type:6} | {video_id} | {length} chars")

    # Calculate success rate
    success_count = sum(1 for _, _, r in results if r["success"])
    total_count = len(results)
    success_rate = (success_count / total_count) * 100 if total_count > 0 else 0

    print(f"\n{'='*60}")
    print(f"Success Rate: {success_count}/{total_count} ({success_rate:.1f}%)")
    print(f"{'='*60}")

    # Don't cleanup automatically so we can inspect files
    print(f"\n💡 Files saved in: {extractor.output_dir}")
    print(f"   Run manually to cleanup: rm -rf {extractor.output_dir}")

    return results


if __name__ == "__main__":
    results = main()
