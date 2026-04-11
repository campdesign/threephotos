// netlify/functions/generate-artwork.js

const SB_URL = 'https://fzeosiuwbhjnfzrobhkq.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ6ZW9zaXV3YmhqbmZ6cm9iaGtxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4NDQ4MTYsImV4cCI6MjA5MTQyMDgxNn0.fi5UC3ccIPEfVsv3E9lz_00JdHinYJaDZX0wOqSmQp4';
const REPLICATE_TOKEN = process.env.REPLICATE_TOKEN;

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    // 1. Load entries
    const entriesRes = await fetch(
      `${SB_URL}/rest/v1/entries?select=*&order=created_at.asc`,
      { headers: { 'apikey': SB_KEY, 'Authorization': `Bearer ${SB_KEY}` } }
    );
    const entries = await entriesRes.json();
    console.log('Entries loaded:', entries.length);

    if (!Array.isArray(entries) || entries.length === 0) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'No entries found' }) };
    }

    // 2. Collect photo URLs and narratives
    const photoUrls = [];
    const narrativeTexts = [];

    entries.forEach(entry => {
      entry.photos.forEach(photo => {
        if (photo.src && photo.src.startsWith('http')) photoUrls.push(photo.src);
        if (photo.narrative && photo.narrative.trim()) narrativeTexts.push(photo.narrative.trim());
      });
    });

    console.log('Photos found:', photoUrls.length, 'Narratives:', narrativeTexts.length);

    if (photoUrls.length === 0) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'No valid photo URLs found' }) };
    }

    // Pick up to 12 spread across the collective
    const step = Math.max(1, Math.floor(photoUrls.length / 12));
    const selectedPhotos = photoUrls.filter((_, i) => i % step === 0).slice(0, 12);

    // 3. Build prompt
    const promptNarratives = narrativeTexts.slice(0, 15).map(n => n.slice(0, 60)).join('. ');
    const prompt = `Abstract undulating artwork made from human memory and photographs. Dark background, gold light, organic flowing forms, dreamlike and cinematic. ${promptNarratives}. Museum quality, painterly.`;

    console.log('Calling Replicate with photo:', selectedPhotos[0]);

    // 4. Call Replicate - SDXL img2img
    const replicateRes = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: {
        'Authorization': `Token ${REPLICATE_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        version: 'da77bc59ee60423279fd632efb4795ab731d9e3ca9705ef3341091fb989b7eaf',
        input: {
          prompt,
          image: selectedPhotos[0],
          prompt_strength: 0.75,
          num_inference_steps: 40,
          guidance_scale: 7.5,
          width: 1024,
          height: 1024,
        }
      })
    });

    const prediction = await replicateRes.json();
    console.log('Replicate prediction:', prediction.id, prediction.status, prediction.error);

    if (!prediction.id) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'Replicate rejected request', detail: prediction }) };
    }

    // 5. Poll for completion
    let result = prediction;
    let attempts = 0;

    while (result.status !== 'succeeded' && result.status !== 'failed' && attempts < 60) {
      await new Promise(r => setTimeout(r, 3000));
      const pollRes = await fetch(`https://api.replicate.com/v1/predictions/${result.id}`, {
        headers: { 'Authorization': `Token ${REPLICATE_TOKEN}` }
      });
      result = await pollRes.json();
      console.log(`Poll ${attempts}: ${result.status}`);
      attempts++;
    }

    if (result.status !== 'succeeded' || !result.output) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'Generation failed', status: result.status, logs: result.logs }) };
    }

    const artworkUrl = Array.isArray(result.output) ? result.output[0] : result.output;
    console.log('Artwork generated:', artworkUrl);

    // 6. Save to Supabase settings
    await fetch(`${SB_URL}/rest/v1/settings`, {
      method: 'POST',
      headers: {
        'apikey': SB_KEY,
        'Authorization': `Bearer ${SB_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates'
      },
      body: JSON.stringify({ key: 'artwork_url', value: artworkUrl })
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, artworkUrl, photosUsed: selectedPhotos.length })
    };

  } catch (err) {
    console.error('Function error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
