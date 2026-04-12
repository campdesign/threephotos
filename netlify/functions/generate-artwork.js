const SB_URL = 'https://fzeosiuwbhjnfzrobhkq.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ6ZW9zaXV3YmhqbmZ6cm9iaGtxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4NDQ4MTYsImV4cCI6MjA5MTQyMDgxNn0.fi5UC3ccIPEfVsv3E9lz_00JdHinYJaDZX0wOqSmQp4';
const FAL_KEY = 'd51f8039-411b-4ce7-a0b6-fcde9a8f0f97:6b77b8ed596dec3c018263803f064d1b';

exports.handler = async (event) => {
  const headers = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  try {
    const entriesRes = await fetch(`${SB_URL}/rest/v1/entries?select=*&order=created_at.asc`, { headers: { 'apikey': SB_KEY, 'Authorization': `Bearer ${SB_KEY}` } });
    const entries = await entriesRes.json();
    console.log('Entries loaded:', entries.length);
    if (!Array.isArray(entries) || entries.length === 0) return { statusCode: 400, headers, body: JSON.stringify({ error: 'No entries found' }) };
    const photoUrls = [];
    const narrativeTexts = [];
    entries.forEach(entry => { entry.photos.forEach(photo => { if (photo.src && photo.src.startsWith('http')) photoUrls.push(photo.src); if (photo.narrative && photo.narrative.trim()) narrativeTexts.push(photo.narrative.trim()); }); });
    console.log('Photos:', photoUrls.length, 'Narratives:', narrativeTexts.length);
    if (photoUrls.length === 0) return { statusCode: 400, headers, body: JSON.stringify({ error: 'No valid photo URLs' }) };
    const promptNarratives = narrativeTexts.slice(0, 15).map(n => n.slice(0, 80)).join('. ');
    const prompt = `An abstract undulating digital artwork made from human memory and photographs. Dark background with gold light bleeding through. Organic flowing forms, dreamlike and cinematic. ${promptNarratives}. Museum quality, painterly.`;
    console.log('Calling Fal.ai...');
    const falRes = await fetch('https://fal.run/fal-ai/flux/schnell', { method: 'POST', headers: { 'Authorization': `Key ${FAL_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt, image_size: 'square_hd', num_inference_steps: 4, num_images: 1, enable_safety_checker: false }) });
    const falData = await falRes.json();
    console.log('Fal.ai response:', JSON.stringify(falData).slice(0, 300));
    if (!falData.images || !falData.images[0]) return { statusCode: 500, headers, body: JSON.stringify({ error: 'Fal.ai failed', detail: falData }) };
    const artworkUrl = falData.images[0].url;
    console.log('Artwork URL:', artworkUrl);
    await fetch(`${SB_URL}/rest/v1/settings`, { method: 'POST', headers: { 'apikey': SB_KEY, 'Authorization': `Bearer ${SB_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'resolution=merge-duplicates' }, body: JSON.stringify({ key: 'artwork_url', value: artworkUrl }) });
    return { statusCode: 200, headers, body: JSON.stringify({ success: true, artworkUrl }) };
  } catch (err) {
    console.error('Error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
