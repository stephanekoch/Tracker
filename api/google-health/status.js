const SUPABASE_URL = 'https://bhyjfyjydbaeoxipvsqq.supabase.co';
const SUPABASE_KEY = 'sb_publishable_N4rk_9nA_oVu6AHC8qW4tQ_pARMMDLW';
const SB = { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` };
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');
  const r = await fetch(`${SUPABASE_URL}/rest/v1/tracker_settings?key=like.gh_*&select=key,value`, { headers: SB });
  const rows = await r.json();
  const s = Object.fromEntries((rows || []).map(x => [x.key, x.value]));
  return res.status(200).json({
    status: s.gh_status || 'not_connected',
    lastSync: s.gh_last_sync || null,
    lastError: s.gh_last_error || null,
    connectedAt: s.gh_connected_at || null,
    configured: !!process.env.GH_CLIENT_ID,
  });
}
