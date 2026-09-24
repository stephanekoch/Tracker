// Pulls one day from the Google Health API and upserts it into tracker_entries.
//   GET  /api/google-health/sync?date=YYYY-MM-DD      (defaults to yesterday, London time)
//   GET  /api/google-health/sync?date=...&debug=1     (returns the raw Google payloads too)
//   Cron calls it with Authorization: Bearer CRON_SECRET; manual calls need no secret.
const SUPABASE_URL = 'https://bhyjfyjydbaeoxipvsqq.supabase.co';
const SUPABASE_KEY = 'sb_publishable_N4rk_9nA_oVu6AHC8qW4tQ_pARMMDLW';
const SB = { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' };
const GH = 'https://health.googleapis.com/v4/users/me/dataTypes';
const STRENGTH = new Set(['STRENGTH_TRAINING','WEIGHTLIFTING','WEIGHTS','FREE_WEIGHTS','WEIGHT_MACHINES','POWERLIFTING',
  'FUNCTIONAL_STRENGTH_TRAINING','CIRCUIT_TRAINING','CROSSFIT','HIIT','BODY_WEIGHT','CALISTHENICS','WORKOUT','CROSS_TRAINING','BOOTCAMP','TRX']);

async function getSetting(key) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/tracker_settings?key=eq.${key}&select=value`, { headers: SB });
  const rows = await r.json(); return rows.length ? rows[0].value : null;
}
async function setSetting(key, value) {
  await fetch(`${SUPABASE_URL}/rest/v1/tracker_settings?on_conflict=key`, {
    method: 'POST', headers: { ...SB, Prefer: 'return=minimal,resolution=merge-duplicates' },
    body: JSON.stringify({ key, value: value == null ? '' : String(value), updated_at: new Date().toISOString() }),
  });
}
function londonDate(offsetDays = 0) {
  const d = new Date(Date.now() + offsetDays * 86400000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}
function nextDay(iso) { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); }
function civil(iso) { const [y, m, d] = iso.split('-').map(Number); return { date: { year: y, month: m, day: d } }; }

// First numeric leaf whose key (or an ancestor key) matches `re`
function deepFind(obj, re, depth = 0) {
  if (obj == null || depth > 6) return null;
  if (typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj)) {
      if (re.test(k)) {
        if (typeof v === 'number') return v;
        if (typeof v === 'string' && v !== '' && !isNaN(Number(v))) return Number(v);
        if (typeof v === 'object') { const n = deepFind(v, /./, depth + 1); if (n != null) return n; }
      }
    }
    for (const v of Object.values(obj)) { if (typeof v === 'object') { const n = deepFind(v, re, depth + 1); if (n != null) return n; } }
  }
  return null;
}

async function accessToken() {
  const refresh = await getSetting('gh_refresh_token');
  if (!refresh) throw Object.assign(new Error('not_connected'), { code: 'not_connected' });
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refresh,
      client_id: process.env.GH_CLIENT_ID, client_secret: process.env.GH_CLIENT_SECRET }),
  });
  const tok = await r.json();
  if (!r.ok || !tok.access_token) throw Object.assign(new Error('reconnect: ' + JSON.stringify(tok)), { code: 'reconnect' });
  return tok.access_token;
}

async function gh(token, path, opts = {}) {
  const r = await fetch(`${GH}/${path}`, { ...opts, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(opts.headers || {}) } });
  const body = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, body };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const isCron = req.headers['authorization'] === `Bearer ${process.env.CRON_SECRET}`;
  const date = (req.query.date && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date)) ? req.query.date : (isCron && req.query.today ? londonDate(0) : londonDate(-1));
  const debug = req.query.debug === '1';
  const raw = {};
  try {
    const token = await accessToken();
    const day = civil(date), next = civil(nextDay(date));
    const out = {};

    // Steps — daily roll-up
    const st = await gh(token, 'steps/dataPoints:dailyRollUp', { method: 'POST', body: JSON.stringify({ range: { start: day, end: next } }) });
    raw.steps = st.body;
    if (st.ok) { const v = deepFind((st.body.rollupDataPoints || [])[0]?.steps, /countSum|count/); if (v != null) out.steps = Math.round(v); }

    // Sleep — sessions ending on this civil date, naps excluded
    const sl = await gh(token, `sleep/dataPoints?pageSize=25&filter=${encodeURIComponent(`sleep.interval.civil_end_time >= "${date}" AND sleep.interval.civil_end_time < "${nextDay(date)}"`)}`);
    raw.sleep = sl.body;
    if (sl.ok) {
      let mins = 0;
      for (const p of sl.body.dataPoints || []) {
        const s = p.sleep || {};
        if (s.metadata && s.metadata.nap) continue;
        const m = Number(s.summary?.minutesAsleep);
        if (isFinite(m)) mins += m;
      }
      if (mins > 0) out.sleep = Math.floor(mins / 60) + ':' + String(mins % 60).padStart(2, '0');
    }

    // Weight — last sample recorded that day
    const wt = await gh(token, `weight/dataPoints?pageSize=100&filter=${encodeURIComponent(`weight.sample_time.civil_time >= "${date}" AND weight.sample_time.civil_time < "${nextDay(date)}"`)}`);
    raw.weight = wt.body;
    if (wt.ok && (wt.body.dataPoints || []).length) {
      const last = wt.body.dataPoints[wt.body.dataPoints.length - 1].weight;
      let kg = deepFind(last, /kilogram|^kg$|kgs/i);
      if (kg == null) { const g = deepFind(last, /gram/i); if (g != null) kg = g / 1000; }
      if (kg == null) { const lb = deepFind(last, /pound|lb/i); if (lb != null) kg = lb * 0.45359237; }
      if (kg != null && kg > 20 && kg < 300) out.bodyweight = Math.round(kg * 10) / 10;
    }

    // Calories eaten — nutrition-log daily roll-up (may 400 if not enabled for this account)
    const nu = await gh(token, 'nutrition-log/dataPoints:dailyRollUp', { method: 'POST', body: JSON.stringify({ range: { start: day, end: next } }) });
    raw.nutrition = nu.body;
    if (nu.ok) { const kcal = deepFind((nu.body.rollupDataPoints || [])[0]?.nutritionLog, /kcal|calor|energy/i); if (kcal != null && kcal > 0) out.calories = Math.round(kcal); }

    // Gym — any strength-type exercise session that day
    const ex = await gh(token, `exercise/dataPoints?pageSize=25&filter=${encodeURIComponent(`exercise.interval.civil_end_time >= "${date}" AND exercise.interval.civil_end_time < "${nextDay(date)}"`)}`);
    raw.exercise = ex.body;
    if (ex.ok) {
      const types = (ex.body.dataPoints || []).map(p => p.exercise?.exerciseType).filter(Boolean);
      if (types.some(t => STRENGTH.has(t))) out.gym = true;
      out._exerciseTypes = types;
    }

    // Upsert — only the fields Google gave us; manual fields stay untouched
    const patch = {};
    if (out.steps != null) patch.steps = out.steps;
    if (out.sleep) patch.sleep = out.sleep;
    if (out.bodyweight != null) patch.bodyweight = out.bodyweight;
    if (out.calories != null) patch.calories = out.calories;
    if (out.gym) patch.gym = true;

    let wrote = false;
    if (Object.keys(patch).length) {
      const ex1 = await fetch(`${SUPABASE_URL}/rest/v1/tracker_entries?date=eq.${date}&select=date`, { headers: SB });
      const exists = (await ex1.json()).length > 0;
      const w = exists
        ? await fetch(`${SUPABASE_URL}/rest/v1/tracker_entries?date=eq.${date}`, { method: 'PATCH', headers: { ...SB, Prefer: 'return=minimal' }, body: JSON.stringify(patch) })
        : await fetch(`${SUPABASE_URL}/rest/v1/tracker_entries`, { method: 'POST', headers: { ...SB, Prefer: 'return=minimal' }, body: JSON.stringify({ date, ...patch }) });
      if (!w.ok) throw new Error('Supabase write failed: ' + await w.text());
      wrote = true;
    }
    await setSetting('gh_status', 'connected');
    await setSetting('gh_last_sync', new Date().toISOString());
    await setSetting('gh_last_error', '');
    return res.status(200).json({ ok: true, date, synced: patch, wrote, exerciseTypes: out._exerciseTypes || [], ...(debug ? { raw } : {}) });
  } catch (e) {
    const code = e.code || 'error';
    if (code === 'reconnect' || code === 'not_connected') await setSetting('gh_status', code);
    await setSetting('gh_last_error', String(e.message || e).slice(0, 300));
    return res.status(code === 'not_connected' ? 400 : 500).json({ ok: false, code, error: String(e.message || e), ...(debug ? { raw } : {}) });
  }
}
