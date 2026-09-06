// Tracker — Supabase direct API (replaces Google Apps Script proxy)
const SUPABASE_URL = 'https://bhyjfyjydbaeoxipvsqq.supabase.co';
const SUPABASE_KEY = 'sb_publishable_N4rk_9nA_oVu6AHC8qW4tQ_pARMMDLW';

const sb = (path, opts = {}) => fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
  ...opts,
  headers: {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': opts.prefer || 'return=minimal',
    ...opts.headers,
  },
});

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (req.method === 'GET') {
      const action = req.query.action || 'getAll';

      if (action === 'getAll') {
        const r = await sb('tracker_entries?select=*&order=date');
        const rows = await r.json();
        if (!r.ok) throw new Error(JSON.stringify(rows));
        return res.status(200).json({
          rows: rows.map(mapOut),
          scriptVersion: 'supabase-v1'
        });
      }

      if (action === 'getRow') {
        const date = req.query.date;
        const r = await sb(`tracker_entries?date=eq.${date}&select=*`);
        const rows = await r.json();
        if (!r.ok) throw new Error(JSON.stringify(rows));
        if (!rows.length) return res.status(200).json({ error: 'Date not found: ' + date });
        return res.status(200).json(mapOut(rows[0]));
      }

      if (action === 'getGoal') {
        const r = await sb('tracker_goal?select=*&order=created_at.desc&limit=1');
        const rows = await r.json();
        if (!r.ok) throw new Error(JSON.stringify(rows));
        if (!rows.length) return res.status(200).json({ goal: null });
        const g = rows[0];
        return res.status(200).json({
          goal: {
            targetWeight: g.target_weight,
            deadline: g.deadline,
            rate: g.rate || 'medium',
            createdDate: g.created_at?.split('T')[0] || '',
            startWeight: g.start_weight || null,
          }
        });
      }

      if (action === 'diag') {
        return res.status(200).json({ ok: true, backend: 'supabase', scriptVersion: 'supabase-v1' });
      }

      return res.status(400).json({ error: 'Unknown action' });
    }

    if (req.method === 'POST') {
      const payload = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const action = payload.action;

      if (action === 'saveRow') {
        const row = mapIn(payload);
        // Upsert on date
        const r = await sb('tracker_entries?on_conflict=date', {
          method: 'POST',
          prefer: 'return=minimal,resolution=merge-duplicates',
          body: JSON.stringify(row),
        });
        if (!r.ok) { const e = await r.text(); throw new Error(e); }
        return res.status(200).json({ success: true, date: payload.date });
      }

      if (action === 'saveGoal') {
        // Delete existing and insert new (single-goal model)
        await sb('tracker_goal', { method: 'DELETE', headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' } });
        const r = await sb('tracker_goal', {
          method: 'POST',
          body: JSON.stringify({
            target_weight: parseFloat(payload.targetWeight) || null,
            deadline: payload.deadline || null,
            rate: payload.rate || 'medium',
            start_weight: parseFloat(payload.startWeight) || null,
          }),
        });
        if (!r.ok) { const e = await r.text(); throw new Error(e); }
        return res.status(200).json({ success: true });
      }

      if (action === 'deleteGoal') {
        await sb('tracker_goal?id=neq.00000000-0000-0000-0000-000000000000', {
          method: 'DELETE',
          headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' }
        });
        return res.status(200).json({ success: true });
      }

      return res.status(400).json({ error: 'Unknown action' });
    }

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

function mapOut(r) {
  return {
    date: r.date,
    gym: r.gym || false,
    mood: r.mood || '',
    vitalityPoints: r.vitality_points || 0,
    steps: r.steps ? String(r.steps) : '',
    bodyweight: r.bodyweight ? String(r.bodyweight) : '',
    calories: r.calories ? String(r.calories) : '',
    sleep: r.sleep || '',
    hackChinese: r.hack_chinese || false,
    hackChineseWords: r.hack_chinese_words ? String(r.hack_chinese_words) : '',
    duChinese: r.du_chinese || false,
    yoyoChinese: r.yoyo_chinese || false,
    scriptVersion: 'supabase-v1',
  };
}

function mapIn(d) {
  return {
    date: d.date,
    gym: !!d.gym,
    mood: d.mood || null,
    vitality_points: parseInt(d.vitalityPoints) || 0,
    steps: d.steps ? parseInt(String(d.steps).replace(/,/g,'')) || null : null,
    bodyweight: d.bodyweight ? parseFloat(d.bodyweight) || null : null,
    calories: d.calories ? parseInt(d.calories) || null : null,
    sleep: d.sleep || null,
    hack_chinese: !!d.hackChinese,
    hack_chinese_words: d.hackChineseWords ? parseInt(d.hackChineseWords) || null : null,
    du_chinese: !!d.duChinese,
    yoyo_chinese: !!d.yoyoChinese,
  };
}
