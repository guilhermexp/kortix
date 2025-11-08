import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://lrqjdzqyaoiovnzfbnrj.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxycWpkenF5YW9pb3ZuemZibnJqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1OTE2NzI0OSwiZXhwIjoyMDc0NzQzMjQ5fQ.cBCXvycwWSFD1G4BMRx4-f8gYzhWtPBEa4WQBGVXs1U'
);

// Get the most recent document
const { data, error } = await supabase
  .from('documents')
  .select('id, title, url, preview_image, metadata, raw')
  .order('created_at', { ascending: false })
  .limit(1)
  .single();

if (error) {
  console.error('Error:', error);
} else {
  console.log('\n📄 Document:', data.title);
  console.log('🔗 URL:', data.url);
  console.log('\n🖼️  Preview Image Field:', data.preview_image || '❌ NULL/EMPTY');

  console.log('\n📦 Metadata field:');
  if (data.metadata?.image) {
    console.log('   ✅ metadata.image:', data.metadata.image);
  } else {
    console.log('   ❌ metadata.image: NOT FOUND');
  }

  console.log('\n📦 Raw field structure:');
  if (data.raw) {
    console.log('   Keys:', Object.keys(data.raw).join(', '));

    if (data.raw.extraction) {
      console.log('   raw.extraction keys:', Object.keys(data.raw.extraction).join(', '));
      console.log('   raw.extraction full:', JSON.stringify(data.raw.extraction, null, 2));

      if (data.raw.extraction.metadata) {
        console.log('   raw.extraction.metadata keys:', Object.keys(data.raw.extraction.metadata).join(', '));
        if (data.raw.extraction.metadata.image) {
          console.log('   ✅ raw.extraction.metadata.image:', data.raw.extraction.metadata.image);
        }
      } else {
        console.log('   ❌ raw.extraction.metadata: NOT FOUND');
      }
    }

    if (data.raw.images) {
      console.log('   ✅ raw.images count:', data.raw.images.length);
      console.log('   First image:', data.raw.images[0]);
    } else {
      console.log('   ❌ raw.images: NOT FOUND');
    }
  } else {
    console.log('   ❌ raw field is NULL');
  }

}
