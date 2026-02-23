async (page) => {
  const res = await page.evaluate(async () => {
    const r = await fetch('/v3/documents/documents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
      credentials: 'include'
    });
    const data = await r.json();
    const doc = data.documents.find(d => (d.url || '').includes('summarize.sh') || (d.title || '').includes('summarize'));
    if (!doc) return 'NOT FOUND';
    const raw = doc.raw || {};
    const ext = raw.extraction || {};
    const mt = ext.metaTags || {};
    const fc = raw.firecrawl || ext.firecrawl || {};
    const fcm = fc.metadata || {};
    return JSON.stringify({
      previewImage: doc.previewImage || doc.preview_image || null,
      ogImage: mt.ogImage || null,
      twitterImage: mt.twitterImage || null,
      extractionImagesCount: (ext.images || []).length,
      extractionImages3: (ext.images || []).slice(0, 3),
      rawImagesCount: (raw.images || []).length,
      rawImages3: (raw.images || []).slice(0, 3),
      firecrawlOgImage: fcm.ogImage || fc.ogImage || null,
      firecrawlImagesCount: (fc.images || fcm.images || []).length,
      firecrawlImages3: (fc.images || fcm.images || []).slice(0, 3),
      firecrawlScreenshot: fc.screenshot || null,
      metadataOgImage: (doc.metadata || {}).ogImage || null,
      metadataImages: (doc.metadata || {}).images || null,
      allRawKeys: Object.keys(raw),
      allExtKeys: Object.keys(ext),
    }, null, 2);
  });
  console.log(res);
}
