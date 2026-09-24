// One function for every "connect an account" step (Vercel Hobby allows 12 functions).
//   /api/connect?provider=google&step=start|callback
//   /api/connect?provider=fatsecret&step=start|callback
// The old paths (/api/google-health/auth, /callback, /api/fatsecret/auth, /callback)
// are rewritten here in vercel.json, so registered redirect URIs keep working.
import { getSetting, setSetting, APP_URL, londonDate } from './_lib/core.js';
import { signedParams, FS_AUTH } from './_lib/fatsecret.js';
import { runSync } from './_lib/run.js';

const GOOGLE_REDIRECT = `${APP_URL}/api/google-health/callback`;
const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly',
  'https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly',
  'https://www.googleapis.com/auth/googlehealth.sleep.readonly',
  'https://www.googleapis.com/auth/googlehealth.nutrition.readonly',
];
const page = (t, b) => `<!doctype html><meta name=viewport content="width=device-width,initial-scale=1"><body style="font-family:-apple-system,Inter,sans-serif;padding:32px 20px;max-width:440px;margin:0 auto;color:#1a1a1a;line-height:1.5"><h2 style="margin:0 0 8px">${t}</h2>${b}<p><a href="/" style="display:inline-block;margin-top:12px;background:#c24a2e;color:#fff;text-decoration:none;padding:12px 18px;border-radius:12px;font-weight:600">Back to Tracker</a></p></body>`;

async function googleStart(req, res) {
  if (!process.env.GH_CLIENT_ID) return res.status(500).send(page('Not set up', '<p>GH_CLIENT_ID is not set in Vercel.</p>'));
  const p = new URLSearchParams({ client_id: process.env.GH_CLIENT_ID, redirect_uri: GOOGLE_REDIRECT, response_type: 'code',
    scope: GOOGLE_SCOPES.join(' '), access_type: 'offline', prompt: 'consent' });
  res.writeHead(302, { Location: 'https://accounts.google.com/o/oauth2/v2/auth?' + p.toString() }); res.end();
}
async function googleCallback(req, res) {
  const { code, error } = req.query;
  if (error) return res.status(400).send(page('Not connected', '<p>Google returned: ' + error + '</p>'));
  if (!code) return res.status(400).send(page('Not connected', '<p>No authorisation code received.</p>'));
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: GOOGLE_REDIRECT, client_id: process.env.GH_CLIENT_ID, client_secret: process.env.GH_CLIENT_SECRET }) });
  const tok = await r.json();
  if (!r.ok || !tok.refresh_token) return res.status(500).send(page('Not connected', '<p>Token exchange failed: ' + JSON.stringify(tok) + '</p>'));
  await setSetting('gh_refresh_token', tok.refresh_token);
  await setSetting('gh_status', 'connected');
  await setSetting('gh_connected_at', new Date().toISOString());
  await setSetting('gh_last_error', '');
  await setSetting('gh_access_token', ''); await setSetting('gh_access_exp', '0');
  try { await runSync([londonDate(-1), londonDate(0)], { fatsecret: false }); } catch (e) {}
  return res.status(200).send(page('Google Health connected', '<p style="color:#555">Steps, sleep, bodyweight and gym sessions will now sync automatically.</p>'));
}
async function fatsecretStart(req, res) {
  if (!process.env.FS_CONSUMER_KEY || !process.env.FS_CONSUMER_SECRET)
    return res.status(500).send(page('FatSecret not set up', '<p>Add FS_CONSUMER_KEY and FS_CONSUMER_SECRET in Vercel, then redeploy.</p>'));
  const url = `${FS_AUTH}/request_token`;
  const p = signedParams('POST', url, { oauth_callback: `${APP_URL}/api/fatsecret/callback` });
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'TrackerApp/1.0' }, body: new URLSearchParams(p).toString() });
  const out = Object.fromEntries(new URLSearchParams(await r.text()));
  if (!r.ok || !out.oauth_token) {
    return res.status(502).send(page('FatSecret blocked the connection', `<p>FatSecret's login server refused a request from Vercel (status ${r.status}). This is a known issue with their bot protection.</p>
<p><b>Workaround (one-off, ~5 min):</b> use FatSecret's official Postman collection to get an access token and secret for your account, then add them in Vercel as <code>FS_ACCESS_TOKEN</code> and <code>FS_ACCESS_SECRET</code> and redeploy. They don't expire.</p>`));
  }
  await setSetting('fs_req_token', out.oauth_token);
  await setSetting('fs_req_secret', out.oauth_token_secret);
  res.writeHead(302, { Location: `${FS_AUTH}/authorize?oauth_token=${encodeURIComponent(out.oauth_token)}` }); res.end();
}
async function fatsecretCallback(req, res) {
  const { oauth_token, oauth_verifier } = req.query || {};
  if (!oauth_token || !oauth_verifier) return res.status(400).send(page('Not connected', '<p>FatSecret did not return an approval.</p>'));
  const reqSecret = await getSetting('fs_req_secret');
  const url = `${FS_AUTH}/access_token`;
  const p = signedParams('GET', url, { oauth_token, oauth_verifier }, reqSecret || '');
  const r = await fetch(url + '?' + new URLSearchParams(p).toString(), { headers: { 'User-Agent': 'TrackerApp/1.0' } });
  const out = Object.fromEntries(new URLSearchParams(await r.text()));
  if (!r.ok || !out.oauth_token || !out.oauth_token_secret) return res.status(502).send(page('Not connected', '<p>Token exchange failed (status ' + r.status + ').</p>'));
  await setSetting('fs_token', out.oauth_token);
  await setSetting('fs_secret', out.oauth_token_secret);
  await setSetting('fs_status', 'connected');
  await setSetting('fs_req_secret', '');
  try { await runSync([londonDate(-1), londonDate(0)], { google: false }); } catch (e) {}
  return res.status(200).send(page('FatSecret connected', '<p style="color:#555">Calories from your FatSecret diary will now appear in the Tracker automatically.</p>'));
}

export default async function handler(req, res) {
  const { provider, step } = req.query || {};
  try {
    if (provider === 'google') return step === 'callback' ? googleCallback(req, res) : googleStart(req, res);
    if (provider === 'fatsecret') return step === 'callback' ? fatsecretCallback(req, res) : fatsecretStart(req, res);
    return res.status(400).send(page('Unknown provider', '<p>Use provider=google or provider=fatsecret.</p>'));
  } catch (e) {
    return res.status(500).send(page('Something went wrong', '<p>' + String(e.message || e) + '</p>'));
  }
}
