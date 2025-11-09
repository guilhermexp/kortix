# YouTube Title Extraction Bug - "Unknown" Titles

**Issue ID**: YOUTUBE-001
**Severity**: Medium
**Status**: ✅ Fixed
**Date Discovered**: November 9, 2025
**Date Fixed**: November 9, 2025
**Fixed By**: Claude (AI Assistant)
**Commit**: a6526a05

---

## 📋 Summary

YouTube videos were being saved with title "Unknown" instead of their actual video titles when the transcript extraction failed. This affected 6 documents in the database.

---

## 🐛 Bug Description

### Symptoms
- YouTube videos showing "Unknown" as title in the UI
- Affected both newly added videos and existing documents
- Only occurred for videos where transcript extraction failed
- Video metadata extraction was working (titles could be extracted from HTML)

### Affected Documents
6 documents were affected:
1. `259e76ce-4c0d-4b80-b58a-415ab3a1ce55` - "How To Create an AI Avatar IT Support Agent"
2. `8cc4ea5c-5c6d-48df-802e-4348912397b5` - "I built my own Vibe Coding platform"
3. `11d11002-1745-46c2-a453-029239a88769` - "Top 10 Generative AI Papers"
4. `288c57e3-736d-4ab9-9df9-31720b410f18` - "host ALL your AI locally"
5. `3c9e30b3-a91c-43e5-b77f-88eaa98cafc1` - "How I Create AMAZING Horror Videos"
6. `bcc534c1-b7c9-446e-a73e-230fa2491bf2` - "NÃO USE BITCOIN para privacidade!"

---

## 🔍 Root Cause Analysis

### Location
File: `apps/api/src/services/markitdown.ts`
Function: `fetchYouTubeTranscriptFallback()`
Lines: 309-364 (before fix)

### The Problem

The function had the following logic flow:

```typescript
export async function fetchYouTubeTranscriptFallback(videoUrl: string) {
  // 1. Extract title from YouTube HTML (WORKING)
  let title: string | undefined = undefined
  try {
    const response = await fetch(videoUrl, ...)
    const html = await response.text()
    // Extract title from og:title, twitter:title, or <title> tag
    // This part was working correctly!
    title = extractedTitle
  } catch (error) {
    console.warn('Failed to extract title:', error)
  }

  // 2. Try to extract transcript
  for (const lang of langs) {
    for (const asr of variants) {
      const text = await fetchYouTubeTimedTextVtt(videoId, lang, asr)
      if (text && text.length >= 200) {
        return { markdown: text, metadata: { title } }  // ✅ Returns title with transcript
      }
    }
  }

  // 3. THE BUG: Return null if no transcript
  return null  // ❌ DISCARDS THE SUCCESSFULLY EXTRACTED TITLE!
}
```

### Why It Failed

1. **Title extraction worked**: The function successfully extracted the title from YouTube's HTML meta tags (og:title, twitter:title, or <title>)
2. **Transcript extraction failed**: Some videos don't have transcripts available, or the transcript API was rate-limited
3. **Title was discarded**: When transcript extraction failed, the function returned `null`, discarding the title that was already extracted
4. **Fallback logic kicked in**: The YouTube extractor's fallback logic created a generic title "Unknown" when no title was available

### Code Path

```
User adds YouTube URL
  ↓
addDocument() in routes/documents.ts
  ↓
processDocument() in services/ingestion.ts
  ↓
extractDocumentContent() in services/extractor.ts
  ↓
YouTubeExtractor.extract() in services/extraction/youtube-extractor.ts
  ↓
fetchYouTubeTranscriptFallback() in services/markitdown.ts
  ↓
❌ Returns null (loses title)
  ↓
YouTubeExtractor uses fallback title: "Unknown"
```

---

## ✅ Solution

### Code Changes

Modified `fetchYouTubeTranscriptFallback()` to return the title even when transcript extraction fails:

```typescript
// Before (line 363):
return null  // ❌ Discards title

// After (lines 364-376):
// If we couldn't get transcript but have a title, return basic video info
// This prevents losing the title when transcript extraction fails
if (title) {
  console.log('[fetchYouTubeTranscriptFallback] No transcript found, but returning title:', title)
  return {
    markdown: `# ${title}\n\nYouTube Video: ${videoUrl}\n\n(Transcript not available)`,
    metadata: {
      url: videoUrl,
      title,
      markdown_length: 0,
    },
  }
}

return null  // Only return null if both title and transcript extraction failed
```

### Benefits

1. **Preserves extracted title**: Title is no longer lost when transcript fails
2. **Provides basic content**: Creates minimal markdown with video title and URL
3. **Better user experience**: Users see proper video titles instead of "Unknown"
4. **Graceful degradation**: System works even when transcript API is unavailable

---

## 🔧 Remediation Steps

### 1. Fixed Existing Documents

Created and ran a script to fix the 6 affected documents:

```typescript
// fix-unknown-titles.ts
// - Fetched documents with title = "Unknown"
// - Extracted titles from YouTube HTML
// - Updated database with correct titles
// Result: 6/6 documents fixed successfully
```

### 2. Prevented Future Occurrences

The code fix ensures this won't happen again for new YouTube videos.

---

## 📊 Testing

### Test Cases

1. **YouTube video with transcript** ✅
   - Title extracted: ✅
   - Transcript extracted: ✅
   - Result: Full video data with title and transcript

2. **YouTube video without transcript** ✅
   - Title extracted: ✅
   - Transcript extracted: ❌
   - Result: Video data with title and basic info (no transcript)
   - **This was the bug case - now fixed!**

3. **Invalid YouTube URL** ✅
   - Title extracted: ❌
   - Transcript extracted: ❌
   - Result: null (expected behavior)

### Manual Testing

Tested with real YouTube video:
```
URL: https://www.youtube.com/watch?v=i_1C-MLh5K8
Expected: "How To Create an AI Avatar IT Support Agent | Livekit & Beyond Presence Tutorial"
Result: ✅ Title extracted correctly
```

---

## 📝 Lessons Learned

### What Went Wrong

1. **Incomplete error handling**: Function returned `null` too early, losing partial data
2. **Missing fallback logic**: No fallback for "partial success" scenarios
3. **Coupling issues**: Title extraction was coupled with transcript extraction

### Best Practices for Future

1. **Preserve partial data**: Always return what you can extract, even if not everything succeeds
2. **Graceful degradation**: Provide minimal useful data rather than complete failure
3. **Separate concerns**: Title extraction and transcript extraction should be independent
4. **Better logging**: Add logs for partial success cases
5. **Test edge cases**: Test scenarios where only some data is available

### Prevention

1. Add integration tests for YouTube extraction with various scenarios
2. Monitor for documents with "Unknown" or "Untitled" titles
3. Add alerts for high failure rates in extraction services
4. Consider retry logic with exponential backoff for transcript API

---

## 🔗 Related Issues

- None (first occurrence of this specific bug)

## 🔗 Related Code

- `apps/api/src/services/markitdown.ts` - Title extraction logic
- `apps/api/src/services/extraction/youtube-extractor.ts` - YouTube extractor
- `apps/api/src/services/ingestion.ts` - Document processing pipeline

---

## 📚 References

- Commit: `a6526a05` - "fix: YouTube title extraction when transcript is unavailable"
- Date: November 9, 2025
- Files changed: 1
- Lines added: 15

---

## ✅ Resolution Checklist

- [x] Bug identified and root cause found
- [x] Code fix implemented
- [x] Existing affected documents fixed (6/6)
- [x] Manual testing completed
- [x] Changes committed to repository
- [x] Documentation created
- [ ] Integration tests added (TODO)
- [ ] Monitoring/alerts set up (TODO)

---

**Last Updated**: November 9, 2025
**Document Status**: Complete
