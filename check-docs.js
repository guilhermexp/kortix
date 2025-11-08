import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://lrqjdzqyaoiovnzfbnrj.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxycWpkenF5YW9pb3ZuemZibnJqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1OTE2NzI0OSwiZXhwIjoyMDc0NzQzMjQ5fQ.cBCXvycwWSFD1G4BMRx4-f8gYzhWtPBEa4WQBGVXs1U'
);

const { data, error } = await supabase
  .from('documents')
  .select('id, title, content, summary, word_count, status, url')
  .order('created_at', { ascending: false })
  .limit(3);

if (error) {
  console.error('Error:', error);
} else {
  console.log('Last 3 documents:');
  data.forEach((doc, i) => {
    console.log(`\n${i + 1}. ${doc.title || 'Untitled'}`);
    console.log(`   ID: ${doc.id}`);
    console.log(`   Status: ${doc.status}`);
    console.log(`   URL: ${doc.url}`);
    console.log(`   Content length: ${doc.content?.length || 0}`);
    console.log(`   Summary length: ${doc.summary?.length || 0}`);
    console.log(`   Word count: ${doc.word_count || 0}`);
    console.log(`   Content preview: ${doc.content?.substring(0, 100) || 'null'}`);
  });
}
