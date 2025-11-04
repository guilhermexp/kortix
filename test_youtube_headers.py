#!/usr/bin/env python3
"""
Test script to check if custom headers can bypass YouTube rate limiting
Task 1.3: Testing user-agent and headers via CLI
"""

import requests
import time

def test_timedtext_api(video_id: str, use_custom_headers: bool = False):
    """Test YouTube timedtext API with and without custom headers"""

    url = f"https://www.youtube.com/api/timedtext?v={video_id}&lang=en"

    headers = {}
    if use_custom_headers:
        headers = {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Sec-Fetch-User': '?1',
            'Cache-Control': 'max-age=0',
        }

    header_type = "WITH custom headers" if use_custom_headers else "WITHOUT custom headers"
    print(f"\nTesting {header_type}:")
    print(f"URL: {url}")

    try:
        response = requests.get(url, headers=headers, timeout=10)
        print(f"Status Code: {response.status_code}")
        print(f"Content-Type: {response.headers.get('content-type', 'N/A')}")
        print(f"Content-Length: {response.headers.get('content-length', 'N/A')}")

        if response.status_code == 200:
            print(f"✅ SUCCESS! Got {len(response.text)} characters")
            print(f"First 200 chars: {response.text[:200]}")
            return True
        elif response.status_code == 429:
            print(f"❌ Rate limited (429)")
            return False
        else:
            print(f"❌ Unexpected status: {response.status_code}")
            print(f"Response: {response.text[:500]}")
            return False

    except Exception as e:
        print(f"❌ ERROR: {e}")
        return False

if __name__ == "__main__":
    video_id = "dQw4w9WgXcQ"  # Rick Astley

    print("="*60)
    print("YouTube timedtext API Header Testing")
    print("="*60)

    # Test without custom headers
    result1 = test_timedtext_api(video_id, use_custom_headers=False)

    time.sleep(2)  # Brief delay

    # Test with custom headers
    result2 = test_timedtext_api(video_id, use_custom_headers=True)

    print("\n" + "="*60)
    print("RESULTS:")
    print(f"  Without headers: {'✅ PASS' if result1 else '❌ FAIL'}")
    print(f"  With headers:    {'✅ PASS' if result2 else '❌ FAIL'}")
    print("="*60)

    if result2 and not result1:
        print("\n✅ Custom headers HELPED!")
    elif result1 and result2:
        print("\n✅ Both work (no rate limit)")
    else:
        print("\n❌ Custom headers did NOT help - IP is blocked")
