#!/usr/bin/env python3
"""
POC Avançado: yt-dlp com impersonation e fallbacks
Task 2.1: Investigar estratégias avançadas do yt-dlp
"""

import subprocess
import json
import time
from pathlib import Path

class YtDlpAdvancedExtractor:
    """Advanced yt-dlp extraction with multiple strategies"""

    def __init__(self, output_dir="/tmp/ytdlp_advanced"):
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(exist_ok=True)

    def strategy_1_basic(self, video_url: str) -> dict:
        """Strategy 1: Basic extraction (baseline)"""
        print(f"\n{'='*60}")
        print(f"Strategy 1: Basic extraction")
        print(f"{'='*60}")

        video_id = video_url.split("v=")[1] if "v=" in video_url else "unknown"

        cmd = [
            "yt-dlp",
            "--write-auto-sub",
            "--sub-lang", "en",
            "--sub-format", "vtt",
            "--skip-download",
            "-o", f"{self.output_dir}/{video_id}_basic.%(ext)s",
            video_url
        ]

        return self._run_command(cmd, "basic", video_id)

    def strategy_2_web_client(self, video_url: str) -> dict:
        """Strategy 2: Force web client"""
        print(f"\n{'='*60}")
        print(f"Strategy 2: Force web client")
        print(f"{'='*60}")

        video_id = video_url.split("v=")[1] if "v=" in video_url else "unknown"

        cmd = [
            "yt-dlp",
            "--extractor-args", "youtube:player_client=web",
            "--write-auto-sub",
            "--sub-lang", "en",
            "--sub-format", "vtt",
            "--skip-download",
            "-o", f"{self.output_dir}/{video_id}_web.%(ext)s",
            video_url
        ]

        return self._run_command(cmd, "web_client", video_id)

    def strategy_3_android(self, video_url: str) -> dict:
        """Strategy 3: Use Android client"""
        print(f"\n{'='*60}")
        print(f"Strategy 3: Android client")
        print(f"{'='*60}")

        video_id = video_url.split("v=")[1] if "v=" in video_url else "unknown"

        cmd = [
            "yt-dlp",
            "--extractor-args", "youtube:player_client=android",
            "--write-auto-sub",
            "--sub-lang", "en",
            "--sub-format", "vtt",
            "--skip-download",
            "-o", f"{self.output_dir}/{video_id}_android.%(ext)s",
            video_url
        ]

        return self._run_command(cmd, "android", video_id)

    def strategy_4_mediaconnect(self, video_url: str) -> dict:
        """Strategy 4: Use mediaconnect client"""
        print(f"\n{'='*60}")
        print(f"Strategy 4: mediaconnect client")
        print(f"{'='*60}")

        video_id = video_url.split("v=")[1] if "v=" in video_url else "unknown"

        cmd = [
            "yt-dlp",
            "--extractor-args", "youtube:player_client=mediaconnect",
            "--write-auto-sub",
            "--sub-lang", "en",
            "--sub-format", "vtt",
            "--skip-download",
            "-o", f"{self.output_dir}/{video_id}_mediaconnect.%(ext)s",
            video_url
        ]

        return self._run_command(cmd, "mediaconnect", video_id)

    def strategy_5_list_subs(self, video_url: str) -> dict:
        """Strategy 5: Just list available subtitles"""
        print(f"\n{'='*60}")
        print(f"Strategy 5: List available subtitles")
        print(f"{'='*60}")

        cmd = [
            "yt-dlp",
            "--list-subs",
            video_url
        ]

        try:
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=30
            )

            print(f"stdout:\n{result.stdout}")
            print(f"\nstderr:\n{result.stderr}")

            return {
                "success": "Available subtitles" in result.stdout,
                "strategy": "list_subs",
                "stdout": result.stdout,
                "stderr": result.stderr
            }

        except Exception as e:
            print(f"❌ ERROR: {e}")
            return {
                "success": False,
                "strategy": "list_subs",
                "error": str(e)
            }

    def _run_command(self, cmd: list, strategy: str, video_id: str) -> dict:
        """Helper to run command and check for VTT file"""
        try:
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=30
            )

            # Look for VTT file
            vtt_files = list(self.output_dir.glob(f"{video_id}_{strategy}.*.vtt"))

            if vtt_files:
                vtt_file = vtt_files[0]
                content = vtt_file.read_text()

                # Clean VTT content
                lines = content.split('\n')
                text_lines = [
                    line for line in lines
                    if line and not line.startswith('WEBVTT')
                    and '-->' not in line
                    and not line.strip().isdigit()
                ]
                clean_text = ' '.join(text_lines)

                print(f"✅ SUCCESS!")
                print(f"File: {vtt_file.name}")
                print(f"Size: {vtt_file.stat().st_size} bytes")
                print(f"Text length: {len(clean_text)} chars")
                print(f"First 200 chars: {clean_text[:200]}")

                return {
                    "success": True,
                    "strategy": strategy,
                    "file": str(vtt_file),
                    "text": clean_text,
                    "length": len(clean_text),
                    "stdout": result.stdout,
                    "stderr": result.stderr
                }
            else:
                print(f"❌ FAILED - No VTT file created")
                print(f"Return code: {result.returncode}")
                if "429" in result.stderr:
                    print(f"🚫 HTTP 429 - Rate limited!")
                print(f"stderr: {result.stderr}")

                return {
                    "success": False,
                    "strategy": strategy,
                    "error": "No VTT file created",
                    "stdout": result.stdout,
                    "stderr": result.stderr,
                    "rate_limited": "429" in result.stderr
                }

        except Exception as e:
            print(f"❌ ERROR: {e}")
            return {
                "success": False,
                "strategy": strategy,
                "error": str(e)
            }


def main():
    """Test all strategies"""
    print("="*60)
    print("yt-dlp Advanced POC - Multiple Strategies")
    print("Task 2.1: Testing advanced yt-dlp features")
    print("="*60)

    test_url = "https://www.youtube.com/watch?v=dQw4w9WgXcQ"

    extractor = YtDlpAdvancedExtractor()
    results = []

    print(f"\nTesting URL: {test_url}\n")

    # Test all strategies
    strategies = [
        ("Basic", extractor.strategy_1_basic),
        ("Web Client", extractor.strategy_2_web_client),
        ("Android", extractor.strategy_3_android),
        ("MediaConnect", extractor.strategy_4_mediaconnect),
        ("List Subs", extractor.strategy_5_list_subs),
    ]

    for name, strategy_func in strategies:
        print(f"\n{'#'*60}")
        print(f"# Testing: {name}")
        print(f"{'#'*60}")

        result = strategy_func(test_url)
        results.append((name, result))

        time.sleep(2)  # Brief delay between strategies

    # Summary
    print(f"\n\n{'='*60}")
    print("STRATEGY COMPARISON")
    print(f"{'='*60}\n")

    for name, result in results:
        status = "✅ SUCCESS" if result["success"] else "❌ FAILED"
        rate_limited = " [HTTP 429]" if result.get("rate_limited", False) else ""
        length = result.get("length", 0) if result["success"] else 0
        print(f"{status:15} | {name:20} | {length:6} chars{rate_limited}")

    success_count = sum(1 for _, r in results if r["success"])
    rate_limited_count = sum(1 for _, r in results if r.get("rate_limited", False))

    print(f"\n{'='*60}")
    print(f"Success: {success_count}/{len(results)}")
    print(f"Rate Limited: {rate_limited_count}/{len(results)}")
    print(f"{'='*60}")

    if success_count > 0:
        print(f"\n🎉 Found working strategy!")
        for name, result in results:
            if result["success"]:
                print(f"   ✅ {name}: {result.get('length', 0)} chars")
    else:
        print(f"\n❌ All strategies failed - IP is blocked")

    print(f"\n💡 Files saved in: {extractor.output_dir}")

    return results


if __name__ == "__main__":
    results = main()
