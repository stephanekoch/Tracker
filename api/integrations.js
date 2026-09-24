import { getSettings, APP_URL } from './_lib/core.js';
export default async function handler(req, res) {
  if ((req.query || {}).view === 'register') return registerPage(req, res);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');
  const gh = await getSettings('gh_'), fs = await getSettings('fs_');
  return res.status(200).json({
    google: { configured: !!process.env.GH_CLIENT_ID, status: gh.gh_status || 'not_connected', lastSync: gh.gh_last_sync || null, lastError: gh.gh_last_error || null,
              webhook: !!process.env.GH_WEBHOOK_SECRET },
    fatsecret: { configured: !!process.env.FS_CONSUMER_KEY, status: (fs.fs_token || process.env.FS_ACCESS_TOKEN) ? (fs.fs_status || 'connected') : 'not_connected',
                 lastSync: fs.fs_last_sync || null, lastError: fs.fs_last_error || null },
  });
}

// Shown at /api/google-health/register (rewritten here)
function registerPage(req, res) {
  const ok = !!process.env.GH_WEBHOOK_SECRET;
  const body = JSON.stringify({
    endpointUri: `${APP_URL}/api/google-health/webhook`,
    subscriberConfigs: [{ dataTypes: ['steps', 'sleep', 'weight', 'exercise'], subscriptionCreatePolicy: 'AUTOMATIC' }],
    endpointAuthorization: { secret: `Bearer ${process.env.GH_WEBHOOK_SECRET || 'SET_GH_WEBHOOK_SECRET_FIRST'}` },
  }, null, 2);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(200).send(`<!doctype html><meta name=viewport content="width=device-width,initial-scale=1">
<body style="font-family:-apple-system,Inter,sans-serif;padding:24px 18px;max-width:560px;margin:0 auto;color:#1a1a1a;line-height:1.5">
<h2 style="margin:0 0 6px">Register the Google Health webhook</h2>
${ok ? '' : '<p style="color:#c0392b"><b>GH_WEBHOOK_SECRET is not set in Vercel yet.</b> Add it, redeploy, then reload this page.</p>'}
<ol>
<li>Open <a href="https://developers.google.com/health/reference/rest/v4/projects.subscribers/create" target="_blank">projects.subscribers.create</a> and use the <b>Try it</b> panel.</li>
<li><b>parent</b>: <code>projects/YOUR_PROJECT_NUMBER</code> — the <i>number</i> on your Google Cloud dashboard, not the project ID.</li>
<li><b>subscriberId</b>: <code>tracker-webhook</code></li>
<li><b>Request body</b>: paste this, then Execute:</li>
</ol>
<pre style="background:#f5f5f5;padding:12px;border-radius:10px;overflow:auto;font-size:12px">${body.replace(/</g, '&lt;')}</pre>
<p>A <b>200</b> response with <code>"name": "projects/…/subscribers/tracker-webhook"</code> means it's live.</p>
</body>`);
}
