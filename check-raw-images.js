import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://lrqjdzqyaoiovnzfbnrj.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxycWpkenF5YW9pb3ZuemZibnJqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1OTE2NzI0OSwiZXhwIjoyMDc0NzQzMjQ5fQ.cBCXvycwWSFD1G4BMRx4-f8gYzhWtPBEa4WQBGVXs1U'
);

// Check the GitHub roboflow/supervision document
const { data, error } = await supabase
  .from('documents')
  .select('id, title, url, raw')
  .eq('url', 'https://github.com/roboflow/supervision')
  .single();

if (error) {
  console.error('Error:', error);
} else {
  console.log('📄 Document:', data.title);
  console.log('🔗 URL:', data.url);
  console.log('\n📦 Raw field structure:');

  if (data.raw) {
    console.log('   Keys:', Object.keys(data.raw).join(', '));

    if (data.raw.images) {
      console.log('\n✅ raw.images EXISTS!');
      console.log('   Image count:', data.raw.images.length);
      console.log('   First 3 images:');
      data.raw.images.slice(0, 3).forEach((img, i) => {
        console.log(`   ${i + 1}. ${img}`);
      });
    } else {
      console.log('\n❌ raw.images NOT FOUND');
      console.log('   Raw content:', JSON.stringify(data.raw).substring(0, 200) + '...');
    }
  } else {
    console.log('   ❌ raw field is NULL');
  }
}
