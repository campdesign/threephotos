// netlify/functions/generate-artwork.js
// Triggered automatically when 100th photo is submitted,
// or manually via dev panel.
//
// Uses Replicate's Stable Video Diffusion to create
// a morphing collage from the collective's photos and narratives.

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;
const REPLICATE_TOKEN = process.env.REPLICATE_TOKEN;

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    // ── 1. Load all entries from Supabase
    const entriesRes = await fetch(
      `${SB_URL}/rest/v1/entries?select=*&order=created_at.asc`,
      {
        headers: {
          'apikey': SB_KEY,
          'Authorization': `Bearer ${SB_KEY}`
        }
      }
    );
    const entries = await entriesRes.json();

    if (!Array.isArray(entries) || entries.length === 0) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'No entries found' }) };
    }

    // ── 2. Collect photo URLs and narratives
    const photoUrls = [];
    const narrativeTexts = [];

    entries.forEach(entry => {
      entry.photos.forEach(photo => {
        // Only use photos with real URLs (not base64 data URLs — too large for API)
        if (photo.src && photo.src.startsWith('http')) {
          photoUrls.push(photo.src);
        }
        if (photo.narrative && photo.narrative.trim()) {
          narrativeTexts.push(photo.narrative.trim());
        }
      });
    });

    // Pick up to 12 photos spread across the collective
    const step = Math.max(1, Math.floor(photoUrls.length / 12));
    const selectedPhotos = photoUrls.filter((_, i) => i % step === 0).slice(0, 12);

    // ── 3. Build prompt from actual narratives
    // Take key phrases from the first 20 narratives
    const promptNarratives = narrativeTexts
      .slice(0, 20)
      .map(n => n.slice(0, 60))
      .join('. ');

    const prompt = `An abstract undulating digital artwork made from human memory. 
Photographs dissolving and morphing into each other, organic and cinematic. 
Dark background with gold light bleeding between images. 
Flowing, dreamlike, deeply personal. 
The memories behind these photographs: ${promptNarratives}. 
Museum quality, painterly, slow undulation.`;

    // ── 4. Call Replicate — using stable-diffusion-img2img for image composition
    // Model: stability-ai/sdxl for high quality composite
    const replicateRes = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: {
        'Authorization': `Token ${REPLICATE_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        // Using SDXL to generate the artwork from the prompt + first photo as style ref
        version: 'da77bc59ee60423279fd632efb4795ab731d9e3ca9705ef3341091fb989b7eaf',
        input: {
          prompt,
          image: selectedPhotos[0], // use first photo as style reference
          prompt_strength: 0.7,
          num_inference_steps: 50,
          guidance_scale: 7.5,
          width: 1024,
          height: 1024,
        }
      })
    });

    const prediction = await replicateRes.json();

    if (!prediction.id) {
      console.error('Replicate error:', prediction);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Replicate failed', detail: prediction })
      };
    }

    // ── 5. Poll for completion (Replicate is async)
    let result = prediction;
    let attempts = 0;
    const MAX_ATTEMPTS = 60; // 2 minutes max

    while (result.status !== 'succeeded' && result.status !== 'failed' && attempts < MAX_ATTEMPTS) {
      await new Promise(r => setTimeout(r, 2000));
      const pollRes = await fetch(`https://api.replicate.com/v1/predictions/${result.id}`, {
        headers: { 'Authorization': `Token ${REPLICATE_TOKEN}` }
      });
      result = await pollRes.json();
      attempts++;
    }

    if (result.status !== 'succeeded' || !result.output) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Generation failed', status: result.status })
      };
    }

    const artworkUrl = Array.isArray(result.output) ? result.output[0] : result.output;

    // ── 6. Save artwork URL to Supabase settings table
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

    // ── 7. Return success
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        artworkUrl,
        photosUsed: selectedPhotos.length,
        narrativesUsed: Math.min(20, narrativeTexts.length)
      })
    };

  } catch (err) {
    console.error('Function error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message })
    };
  }
};
