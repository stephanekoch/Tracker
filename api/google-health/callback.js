// Exchanges the OAuth code for tokens and stores the refresh token in Supabase.
const SUPABASE_URL = 'https://bhyjfyjydbaeoxipvsqq.supabase.co';
const SUPABASE_KEY = 'sb_publishable_N4rk_9nA_oVu6AHC8qW4tQ_pARMMDLW';
const SB = { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' };
const REDIRECT_URI = 'https://tracker-drab-three.vercel.app/api/google-health/callback';

async function setSetting(key, value) {
  await fetch(`${SUPABASE_URL}/rest/v1/tracker_settings?on_conflict=key`, {
    method: 'POST', headers: { ...SB, Prefer: 'return=minimal,resolution=merge-duplicates' },
    body: JSON.stringify({ key, value: value == null ? '' : String(value), updated_at: new Date().toISOString() }),
  });
}
const page = (title, body) => `<!doctype html><meta name=viewport content="width=device-width,initial-scale=1">
<body style="font-family:-apple-system,Inter,sans-serif;padding:32px 20px;max-width:420px;margin:0 auto;color:#1a1a1a">
<h2 style="margin:0 0 8px">${title}</h2><p style="color:#666;line-height:1.5">${body}</p>
<a href="/" style="display:inline-block;margin-top:16px;background:#e85d40;color:#fff;text-decoration:none;padding:12px 18px;border-radius:12px;font-weight:600">Back to Tracker</a></body>`;

export default async function handler(req, res) {
  const { code, error } = req.query;
  if (error) return res.status(400).send(page('Not connected', 'Google returned: ' + error));
  if (!code) return res.status(400).send(page('Not connected', 'No authorisation code received.'));
  try {
    const r = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code', code, redirect_uri: REDIRECT_URI,
        client_id: process.env.GH_CLIENT_ID, client_secret: process.env.GH_CLIENT_SECRET,
      }),
    });
    const tok = await r.json();
    if (!r.ok || !tok.refresh_token) {
      return res.status(500).send(page('Not connected', 'Token exchange failed: ' + JSON.stringify(tok)));
    }
    await setSetting('gh_refresh_token', tok.refresh_token);
    await setSetting('gh_status', 'connected');
    await setSetting('gh_connected_at', new Date().toISOString());
    await setSetting('gh_last_error', '');
    await setSetting('gh_access_token', '');
    await setSetting('gh_access_exp', '0');
    return res.status(200).send(page('Google Health connected', 'Steps, sleep, bodyweight and gym sessions will now sync automatically.'));
  } catch (e) {
    return res.status(500).send(page('Not connected', String(e && e.message || e)));
  }
}
