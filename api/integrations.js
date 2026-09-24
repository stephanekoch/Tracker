import { getSettings } from './_lib/core.js';
export default async function handler(req, res) {
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
