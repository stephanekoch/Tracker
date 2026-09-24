// Tracker — weekly cron: pushes new Supabase entries to Google Sheet
// Runs every Sunday at 23:00 UTC via Vercel cron
const SUPABASE_URL = 'https://bhyjfyjydbaeoxipvsqq.supabase.co';
const SUPABASE_KEY = 'sb_publishable_N4rk_9nA_oVu6AHC8qW4tQ_pARMMDLW';
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwbloDnIY-mzRU_2zwV3RIPiUwvi4YD05PrUlWjKvfedq1BhLFRuV060ofU07_0ynHEDA/exec';

export default async function handler(req, res) {
  if (req.headers['authorization'] !== `Bearer ${process.env.CRON_SECRET}` &&
      req.query.secret !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // Fetch last 8 days from Supabase
    const since = new Date();
    since.setDate(since.getDate() - 8);
    const sinceStr = since.toISOString().split('T')[0];

    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/tracker_entries?select=*&date=gte.${sinceStr}&order=date`,
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
          gym: r.gym,
          mood: r.mood || '',
          vitalityPoints: r.vitality_points,
          steps: r.steps,
          bodyweight: r.bodyweight,
          calories: r.calories,
          sleep: r.sleep || '',
          hackChinese: r.hack_chinese,
          hackChineseWords: r.hack_chinese_words,
          duChinese: r.du_chinese,
          yoyoChinese: r.yoyo_chinese,
        }))
      })
    });

    const result = await syncRes.json().catch(() => ({ ok: true }));
    return res.status(200).json({ success: true, rowsSynced: rows.length, result });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
