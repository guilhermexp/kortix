#!/usr/bin/env bun

/**
 * Script to fix YouTube video titles that are "Unknown"
 *
 * This script:
 * 1. Finds all documents with title "Unknown" and a YouTube URL
 * 2. Extracts the title from the YouTube page
 * 3. Updates the document with the correct title
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function extractYouTubeTitle(url: string): Promise<string | null> {
  try {
    console.log(`  Fetching title for: ${url}`);
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });
    const html = await response.text();

    // Try og:title
    const ogTitleMatch = html.match(/<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i);
    if (ogTitleMatch) {
      return ogTitleMatch[1];
    }

    // Try twitter:title
    const twitterTitleMatch = html.match(/<meta\s+name=["']twitter:title["']\s+content=["']([^"']+)["']/i);
    if (twitterTitleMatch) {
      return twitterTitleMatch[1];
    }

    // Try <title>
    const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
    if (titleMatch) {
      return titleMatch[1].replace(/ - YouTube$/, '').trim();
    }

    return null;
  } catch (error) {
    console.error(`  Error extracting title: ${error}`);
    return null;
  }
}

async function main() {
  console.log('🔍 Finding YouTube videos with "Unknown" titles...\n');

  // Find all documents with title "Unknown" and a YouTube URL
  const { data: documents, error } = await supabase
    .from('documents')
    .select('id, title, url')
    .eq('title', 'Unknown')
    .or('url.ilike.%youtube.com%,url.ilike.%youtu.be%');

  if (error) {
    console.error('Error fetching documents:', error);
    process.exit(1);
  }

  if (!documents || documents.length === 0) {
    console.log('✅ No YouTube videos with "Unknown" titles found!');
    process.exit(0);
  }

  console.log(`📹 Found ${documents.length} YouTube video(s) with "Unknown" titles\n`);

  let updated = 0;
  let failed = 0;

  for (const doc of documents) {
    console.log(`\n📝 Processing document ${doc.id}`);
    console.log(`  Current title: ${doc.title}`);
    console.log(`  URL: ${doc.url}`);

    if (!doc.url) {
      console.log(`  ⚠️  Skipping: no URL`);
      failed++;
      continue;
    }

    const title = await extractYouTubeTitle(doc.url);

    if (!title) {
      console.log(`  ❌ Failed to extract title`);
      failed++;
      continue;
    }

    console.log(`  ✅ Extracted title: ${title}`);

    // Update the document
    const { error: updateError } = await supabase
      .from('documents')
      .update({ title })
      .eq('id', doc.id);

    if (updateError) {
      console.error(`  ❌ Failed to update: ${updateError.message}`);
      failed++;
    } else {
      console.log(`  ✅ Updated successfully`);
      updated++;
    }

    // Add a small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log('\n' + '='.repeat(60));
  console.log('📊 Summary:');
  console.log(`  Total: ${documents.length}`);
  console.log(`  ✅ Updated: ${updated}`);
  console.log(`  ❌ Failed: ${failed}`);
  console.log('='.repeat(60));
}

main().catch(console.error);
