// Step 1–2 of FatSecret 3-legged OAuth: get a request token, send the user to approve it.
import { setSetting, APP_URL } from '../_lib/core.js';
import { signedParams, FS_AUTH } from '../_lib/fatsecret.js';
const page = (t, b) => `<!doctype html><meta name=viewport content="width=device-width,initial-scale=1"><body style="font-family:-apple-system,Inter,sans-serif;padding:32px 20px;max-width:440px;margin:0 auto;color:#1a1a1a;line-height:1.5"><h2 style="margin:0 0 8px">${t}</h2>${b}<p><a href="/" style="display:inline-block;margin-top:12px;background:#e85d40;color:#fff;text-decoration:none;padding:12px 18px;border-radius:12px;font-weight:600">Back to Tracker</a></p></body>`;
export default async function handler(req, res) {
  if (!process.env.FS_CONSUMER_KEY || !process.env.FS_CONSUMER_SECRET)
    return res.status(500).send(page('FatSecret not set up', '<p>Add FS_CONSUMER_KEY and FS_CONSUMER_SECRET in Vercel, then redeploy.</p>'));
  const url = `${FS_AUTH}/request_token`;
  const p = signedParams('POST', url, { oauth_callback: `${APP_URL}/api/fatsecret/callback` });
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'TrackerApp/1.0' }, body: new URLSearchParams(p).toString() });
  const text = await r.text();
  const out = Object.fromEntries(new URLSearchParams(text));
  if (!r.ok || !out.oauth_token) {
    return res.status(502).send(page('FatSecret blocked the connection', `<p>FatSecret's login server refused a request from Vercel (status ${r.status}). This is a known issue with their bot protection.</p>
<p><b>Workaround (one-off, ~5 min):</b> use FatSecret's official Postman collection to get an access token and secret for your account, then add them in Vercel as <code>FS_ACCESS_TOKEN</code> and <code>FS_ACCESS_SECRET</code> and redeploy. They don't expire.</p>`));
  }
  await setSetting('fs_req_token', out.oauth_token);
  await setSetting('fs_req_secret', out.oauth_token_secret);
  res.writeHead(302, { Location: `${FS_AUTH}/authorize?oauth_token=${encodeURIComponent(out.oauth_token)}` });
  res.end();
}
