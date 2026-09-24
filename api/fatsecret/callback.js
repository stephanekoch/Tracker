// Step 3: swap the approved request token for a permanent access token.
import { getSetting, setSetting } from '../_lib/core.js';
import { signedParams, FS_AUTH } from '../_lib/fatsecret.js';
import { runSync } from '../_lib/run.js';
import { londonDate } from '../_lib/core.js';
const page = (t, b) => `<!doctype html><meta name=viewport content="width=device-width,initial-scale=1"><body style="font-family:-apple-system,Inter,sans-serif;padding:32px 20px;max-width:440px;margin:0 auto;color:#1a1a1a;line-height:1.5"><h2 style="margin:0 0 8px">${t}</h2><p style="color:#666">${b}</p><a href="/" style="display:inline-block;margin-top:12px;background:#e85d40;color:#fff;text-decoration:none;padding:12px 18px;border-radius:12px;font-weight:600">Back to Tracker</a></body>`;
export default async function handler(req, res) {
  const { oauth_token, oauth_verifier } = req.query || {};
  if (!oauth_token || !oauth_verifier) return res.status(400).send(page('Not connected', 'FatSecret did not return an approval.'));
  const reqSecret = await getSetting('fs_req_secret');
  const url = `${FS_AUTH}/access_token`;
  const p = signedParams('GET', url, { oauth_token, oauth_verifier }, reqSecret || '');
  const r = await fetch(url + '?' + new URLSearchParams(p).toString(), { headers: { 'User-Agent': 'TrackerApp/1.0' } });
  const out = Object.fromEntries(new URLSearchParams(await r.text()));
  if (!r.ok || !out.oauth_token || !out.oauth_token_secret) return res.status(502).send(page('Not connected', 'Token exchange failed (status ' + r.status + ').'));
  await setSetting('fs_token', out.oauth_token);
  await setSetting('fs_secret', out.oauth_token_secret);
  await setSetting('fs_status', 'connected');
  await setSetting('fs_req_secret', '');
  try { await runSync([londonDate(-1), londonDate(0)], { google: false }); } catch (e) {}
  return res.status(200).send(page('FatSecret connected', 'Calories from your FatSecret diary will now appear in the Tracker automatically.'));
}
