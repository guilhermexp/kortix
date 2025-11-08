import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://lrqjdzqyaoiovnzfbnrj.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxycWpkenF5YW9pb3ZuemZibnJqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1OTE2NzI0OSwiZXhwIjoyMDc0NzQzMjQ5fQ.cBCXvycwWSFD1G4BMRx4-f8gYzhWtPBEa4WQBGVXs1U'
);

const { data, error } = await supabase
  .from('documents')
  .select('id, title, url, extraction, raw')
  .eq('url', 'https://github.com/roboflow/supervision')
  .single();

if (error) {
  console.error('Error:', error);
} else {
  console.log('Document:', data.title);
  console.log('\nExtraction field:', JSON.stringify(data.extraction, null, 2));
  console.log('\nRaw field keys:', data.raw ? Object.keys(data.raw) : 'null');

  if (data.extraction?.images) {
    console.log('\n✅ extraction.images:', data.extraction.images.length, 'images');
  } else {
    console.log('\n❌ NO extraction.images found');
  }

  if (data.raw?.images) {
    console.log('✅ raw.images:', data.raw.images.length, 'images');
  } else {
    console.log('❌ NO raw.images found');
  }
}
