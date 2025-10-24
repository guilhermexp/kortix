# Fix: Gemini Fallback for Preview Images

## Problem

Not all URLs were showing preview images because meta tags (og:image, twitter:image) were not always present or extractable from the HTML.

**Example:**
- GitHub repository URLs: No og:image in .git URLs
- Some websites: Missing or incorrect meta tags
- Dynamic sites: Meta tags loaded via JavaScript

## Solution

Added Gemini AI as a fallback to analyze HTML and extract the best preview image when meta tags fail.

## Implementation

### New Function: `extractPreviewImageWithGemini()`

**File:** `apps/api/src/services/extractor.ts` (lines 273-301)

```typescript
async function extractPreviewImageWithGemini(html: string, url: string): Promise<string | null> {
  if (!env.GOOGLE_API_KEY) return null

  try {
    const genAI = new GoogleGenerativeAI(env.GOOGLE_API_KEY)
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" })

    const prompt = `Analyze this HTML and extract the best preview image URL.
Look for: og:image meta tags, large hero images, main content images, or logos.
Return ONLY the absolute URL of the best image, or "NONE" if no suitable image found.

HTML:
${html.slice(0, 50000)}

Base URL: ${url}`

    const result = await model.generateContent(prompt)
    const response = result.response.text().trim()

    if (response === "NONE" || !response.startsWith("http")) {
      return null
    }

    return response
  } catch (error) {
    console.warn("Gemini preview extraction failed", error)
    return null
  }
}
```

### Integration Points

**1. MarkItDown URL Processing** (lines 728-730)
```typescript
const metaTags = extractMetaTags(html)
ogImage = metaTags.ogImage || metaTags.twitterImage || null

if (!ogImage) {
  ogImage = await extractPreviewImageWithGemini(html, probableUrl)
}
```

**2. HTML Fallback Processing** (lines 903-906)
```typescript
let ogImage = metaTags.ogImage || metaTags.twitterImage || null
if (!ogImage) {
  ogImage = await extractPreviewImageWithGemini(html, probableUrl)
}
```

## Flow

```
1. Fetch HTML from URL
   ↓
2. Extract meta tags (og:image, twitter:image)
   ↓
3. IF meta tags found:
   → Use og:image
   ↓
4. IF NOT found:
   → Call Gemini with HTML
   → Gemini analyzes and returns best image URL
   ↓
5. Save to raw.extraction.ogImage
```

## Gemini Model

- **Model:** `gemini-1.5-flash` (fast and cost-effective)
- **Input:** First 50,000 characters of HTML + base URL
- **Output:** Absolute URL of best preview image or "NONE"
- **Fallback:** Returns `null` if fails or API key not configured

## What Gemini Looks For

1. **Meta tags:** og:image, twitter:image (in case regex missed)
2. **Hero images:** Large images at top of page
3. **Main content images:** Primary article/post images
4. **Logos:** Site logos as last resort

## Performance Considerations

- Only called when meta tags fail (not for every URL)
- Uses fast model (gemini-1.5-flash)
- HTML limited to 50KB to reduce tokens
- Graceful fallback: if Gemini fails, returns null (no preview)

## Requirements

- `GOOGLE_API_KEY` environment variable must be set
- If not configured, fallback is skipped (meta tags only)

## Benefits

✅ More URLs will have preview images
✅ Works with dynamic sites
✅ Handles missing/incorrect meta tags
✅ Finds best image even without meta tags
✅ No breaking changes (graceful fallback)

## Files Modified

1. **apps/api/src/services/extractor.ts**
   - Added import: `GoogleGenerativeAI`
   - Added function: `extractPreviewImageWithGemini()` (lines 273-301)
   - Modified MarkItDown URL processing (lines 728-730)
   - Modified HTML fallback processing (lines 903-906)

## Testing

Test with URLs that don't have og:image:
1. GitHub repository URLs (.git)
2. Simple HTML pages without meta tags
3. Dynamic sites with JavaScript-loaded images

Expected: These URLs should now have preview images extracted by Gemini.

## Status

✅ **IMPLEMENTED** - Gemini fallback active for all URL processing
