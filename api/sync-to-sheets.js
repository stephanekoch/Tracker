// Weekly cron job: syncs new Supabase workouts to Google Sheets
// Runs every Sunday at 23:00 UTC via Vercel cron
const SUPABASE_URL = 'https://bhyjfyjydbaeoxipvsqq.supabase.co';
const SUPABASE_KEY = 'sb_publishable_N4rk_9nA_oVu6AHC8qW4tQ_pARMMDLW';
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycby2qWuTC_4pzM8YPeYSaBRGZ6K3unIDslv4MILJp8CqPJuAcVgnKpT3ab6tMr0tbGFf/exec';

export default async function handler(req, res) {
  // Only allow cron or manual trigger
  if (req.headers['authorization'] !== `Bearer ${process.env.CRON_SECRET}` &&
      req.query.secret !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // Fetch workouts from last 8 days (covers last week + buffer)
    const since = new Date();
    since.setDate(since.getDate() - 8);
    const sinceStr = since.toISOString().split('T')[0];

    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/workouts?select=*&date=gte.${sinceStr}&order=date,created_at`,
      { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
    );
    const rows = await r.json();

    if (!rows.length) return res.status(200).json({ message: 'No new rows to sync' });

    // Push to Apps Script
    const syncRes = await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'syncFromSupabase',
        rows: rows.map(r => ({
          date: r.date,
          session: r.session,
          exercise: r.exercise,
          sets: r.sets,
          repMin: r.rep_min,
          repMax: r.rep_max,
          rest: r.rest,
          weight: r.weight,
          set1: r.set1,
          set2: r.set2,
          set3: r.set3,
          duration: r.duration,
        }))
      })
    });
    const result = await syncRes.json();
    return res.status(200).json({ success: true, rowsSynced: rows.length, result });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
