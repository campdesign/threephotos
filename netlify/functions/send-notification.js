// netlify/functions/send-notification.js
// type: 'welcome' — confirmation to new subscriber
// type: 'milestone' — fires to all subscribers when 100th photo submitted

const SB_URL   = 'https://fzeosiuwbhjnfzrobhkq.supabase.co';
const SB_KEY   = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ6ZW9zaXV3YmhqbmZ6cm9iaGtxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4NDQ4MTYsImV4cCI6MjA5MTQyMDgxNn0.fi5UC3ccIPEfVsv3E9lz_00JdHinYJaDZX0wOqSmQp4';
const RESEND_KEY = process.env.RESEND_API_KEY;
const FROM     = 'Three Photos <onboarding@resend.dev>'; // swap for your verified domain later
const WORK_URL = 'https://threephotos.netlify.app/work';
const SITE_URL = 'https://threephotos.netlify.app';

exports.handler = async (event) => {
  const headers = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  try {
    const { type, email } = JSON.parse(event.body || '{}');

    if (type === 'welcome') {
      if (!email) return { statusCode: 400, headers, body: JSON.stringify({ error: 'No email' }) };
      await send(email, "You're part of Three Photos", welcomeHtml());
      return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
    }

    if (type === 'milestone') {
      const res     = await fetch(`${SB_URL}/rest/v1/emails?select=email`, {
        headers: { 'apikey': SB_KEY, 'Authorization': `Bearer ${SB_KEY}` }
      });
      const rows = await res.json();
      if (!Array.isArray(rows) || !rows.length) {
        return { statusCode: 200, headers, body: JSON.stringify({ sent: 0 }) };
      }
      let sent = 0;
      for (let i = 0; i < rows.length; i += 10) {
        await Promise.all(
          rows.slice(i, i + 10).map(r =>
            send(r.email, 'Three Photos — The collective is complete.', milestoneHtml())
              .catch(e => console.error('Send failed:', r.email, e.message))
          )
        );
        sent += Math.min(10, rows.length - i);
        if (i + 10 < rows.length) await new Promise(r => setTimeout(r, 200));
      }
      return { statusCode: 200, headers, body: JSON.stringify({ success: true, sent }) };
    }

    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Unknown type' }) };

  } catch (err) {
    console.error(err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};

async function send(to, subject, html) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM, to, subject, html }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function welcomeHtml() {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#0a0a0b;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0b;padding:60px 20px;">
<tr><td align="center"><table style="max-width:520px;width:100%;">
<tr><td style="padding-bottom:28px;border-bottom:1px solid rgba(255,255,255,0.07);">
  <p style="margin:0;font-family:Arial,sans-serif;font-size:9px;letter-spacing:3px;text-transform:uppercase;color:#c9a96e;">Three Photos</p>
</td></tr>
<tr><td style="padding:36px 0 20px;">
  <h1 style="margin:0;font-size:26px;font-weight:300;font-style:italic;color:#f0ece5;line-height:1.3;font-family:Georgia,serif;">You're part of it now.</h1>
</td></tr>
<tr><td>
  <p style="margin:0 0 18px;font-size:14px;line-height:1.85;color:#6b6762;font-family:Georgia,serif;font-weight:300;">Your photographs are in the collective. Each day, one may find a visitor — unannounced, without context.</p>
  <p style="margin:0 0 18px;font-size:14px;line-height:1.85;color:#6b6762;font-family:Georgia,serif;font-weight:300;">When one hundred photographs have been given, we'll let you know. Something will be made from everything the collective gave.</p>
  <p style="margin:0 0 36px;font-size:14px;line-height:1.85;color:#3a3835;font-style:italic;font-family:Georgia,serif;">You'll be among the first to see it.</p>
</td></tr>
<tr><td style="padding-bottom:40px;">
  <a href="${SITE_URL}" style="display:inline-block;border:1px solid rgba(201,169,110,0.4);color:#c9a96e;padding:11px 26px;font-family:Arial,sans-serif;font-size:9px;letter-spacing:2px;text-transform:uppercase;text-decoration:none;">See today's photograph</a>
</td></tr>
<tr><td style="border-top:1px solid rgba(255,255,255,0.06);padding-top:20px;">
  <p style="margin:0;font-family:Arial,sans-serif;font-size:9px;letter-spacing:1px;color:#3a3835;">Three Photos &nbsp;·&nbsp; A Memory Archive</p>
</td></tr>
</table></td></tr></table>
</body></html>`;
}

function milestoneHtml() {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#0a0a0b;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0b;padding:60px 20px;">
<tr><td align="center"><table style="max-width:520px;width:100%;">
<tr><td style="padding-bottom:28px;border-bottom:1px solid rgba(255,255,255,0.07);">
  <p style="margin:0;font-family:Arial,sans-serif;font-size:9px;letter-spacing:3px;text-transform:uppercase;color:#c9a96e;">Three Photos — 100 Photographs</p>
</td></tr>
<tr><td style="padding:36px 0 20px;">
  <h1 style="margin:0;font-size:30px;font-weight:300;font-style:italic;color:#f0ece5;line-height:1.2;font-family:Georgia,serif;">The collective has spoken.</h1>
</td></tr>
<tr><td>
  <p style="margin:0 0 18px;font-size:14px;line-height:1.85;color:#6b6762;font-family:Georgia,serif;font-weight:300;">One hundred photographs. One hundred stories, chosen carefully.</p>
  <p style="margin:0 0 18px;font-size:14px;line-height:1.85;color:#6b6762;font-family:Georgia,serif;font-weight:300;">From everything the collective gave — every image, every memory, every moment someone decided to keep — something has been made.</p>
  <p style="margin:0 0 36px;font-size:15px;line-height:1.85;color:#f0ece5;font-style:italic;font-family:Georgia,serif;">You're among the first to see it.</p>
</td></tr>
<tr><td style="padding-bottom:40px;">
  <a href="${WORK_URL}" style="display:inline-block;background:rgba(201,169,110,0.1);border:1px solid rgba(201,169,110,0.5);color:#c9a96e;padding:13px 34px;font-family:Arial,sans-serif;font-size:9px;letter-spacing:3px;text-transform:uppercase;text-decoration:none;">Enter the work</a>
</td></tr>
<tr><td style="border-top:1px solid rgba(255,255,255,0.06);padding-top:20px;">
  <p style="margin:0;font-family:Arial,sans-serif;font-size:9px;letter-spacing:1px;color:#3a3835;">Three Photos &nbsp;·&nbsp; A Memory Archive</p>
</td></tr>
</table></td></tr></table>
</body></html>`;
}
