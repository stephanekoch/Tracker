// Stores (or clears) the browser's push subscription in Supabase.
const SUPABASE_URL = 'https://bhyjfyjydbaeoxipvsqq.supabase.co';
const SUPABASE_KEY = 'sb_publishable_N4rk_9nA_oVu6AHC8qW4tQ_pARMMDLW';
const H = { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const value = body.subscription ? JSON.stringify(body.subscription) : '';
    const r = await fetch(`${SUPABASE_URL}/rest/v1/tracker_settings?on_conflict=key`, {
      method: 'POST',
      headers: { ...H, Prefer: 'return=minimal,resolution=merge-duplicates' },
      body: JSON.stringify({ key: 'push_subscription', value, updated_at: new Date().toISOString() })
    });
    if (!r.ok) return res.status(502).json({ error: await r.text() });
    return res.status(200).json({ success: true, stored: !!value });
  } catch (err) {
    return res.status(500).json({ error: String(err && err.message || err) });
  }
}
