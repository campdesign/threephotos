const SB_URL = 'https://fzeosiuwbhjnfzrobhkq.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ6ZW9zaXV3YmhqbmZ6cm9iaGtxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4NDQ4MTYsImV4cCI6MjA5MTQyMDgxNn0.fi5UC3ccIPEfVsv3E9lz_00JdHinYJaDZX0wOqSmQp4';
const FAL_KEY = 'd51f8039-411b-4ce7-a0b6-fcde9a8f0f97:6b77b8ed596dec3c018263803f064d1b';

async function falPost(model, input) {
  const res = await fetch(`https://fal.run/${model}`, {
    method: 'POST',
    headers: { 'Authorization': `Key ${FAL_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(input)
  });
  return res.json();
}

exports.handler = async (event) => {
  const headers = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  try {
    // 1. Load entries
    const entriesRes = await fetch(`${SB_URL}/rest/v1/entries?select=*&order=created_at.asc`, {
      headers: { 'apikey': SB_KEY, 'Authorization': `Bearer ${SB_KEY}` }
    });
    const entries = await entriesRes.json();
    console.log('Entries:', entries.length);
    if (!Array.isArray(entries) || entries.length === 0) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'No entries found' }) };
    }

    // 2. Collect narratives
    const narrativeTexts = [];
    entries.forEach(entry => {
      entry.photos.forEach(photo => {
        if (photo.narrative && photo.narrative.trim()) narrativeTexts.push(photo.narrative.trim());
      });
    });

    // 3. Build prompt
    const promptNarratives = narrativeTexts.slice(0, 15).map(n => n.slice(0, 80)).join('. ');
    const prompt = `An abstract undulating digital artwork made from human memory and photographs. Dark background with gold light bleeding through. Organic flowing forms, dreamlike and cinematic. ${promptNarratives}. Museum quality, painterly.`;

    // 4. Generate still image with Flux
    console.log('Generating still image...');
    const imageData = await falPost('fal-ai/flux/schnell', {
      prompt,
      image_size: 'square_hd',
      num_inference_steps: 4,
      num_images: 1,
      enable_safety_checker: false
    });

    console.log('Image response:', JSON.stringify(imageData).slice(0, 200));

    if (!imageData.images || !imageData.images[0]) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'Image generation failed', detail: imageData }) };
    }

    const stillUrl = imageData.images[0].url;
    console.log('Still image URL:', stillUrl);

    // 5. Animate the still image into video using Stable Video Diffusion
    console.log('Generating video from still...');
    const videoData = await falPost('fal-ai/stable-video', {
      image_url: stillUrl,
      motion_bucket_id: 80,      // higher = more motion
      cond_aug: 0.02,
      fps: 7,
      num_frames: 25
    });

    console.log('Video response:', JSON.stringify(videoData).slice(0, 300));

    // Get video URL — try different response shapes
    const videoUrl = videoData.video?.url
      || videoData.video
      || videoData.url
      || videoData.output?.video
      || stillUrl; // fallback to still if video fails

    console.log('Final artwork URL:', videoUrl);

    // 6. Save to Supabase
    await fetch(`${SB_URL}/rest/v1/settings`, {
      method: 'POST',
      headers: {
        'apikey': SB_KEY,
        'Authorization': `Bearer ${SB_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates'
      },
      body: JSON.stringify({ key: 'artwork_url', value: videoUrl })
    });

    // Also save still as backup
    await fetch(`${SB_URL}/rest/v1/settings`, {
      method: 'POST',
      headers: {
        'apikey': SB_KEY,
        'Authorization': `Bearer ${SB_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates'
      },
      body: JSON.stringify({ key: 'artwork_still_url', value: stillUrl })
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, videoUrl, stillUrl })
    };

  } catch (err) {
    console.error('Error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
