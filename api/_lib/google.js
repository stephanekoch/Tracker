// Google Health API: token handling and one fetcher per metric.
import { getSetting, setSetting, nextDay } from './core.js';
const GH = 'https://health.googleapis.com/v4/users/me/dataTypes';
// Sessions of these types never count as a workout (everyday movement, not training).
export const NOT_WORKOUT = new Set(['WALKING', 'WALK', 'SLEEP', 'MEDITATION', 'BREATHING', 'STILL']);
const MIN_WORKOUT_MINUTES = 10;

function civil(iso) { const [y, m, d] = iso.split('-').map(Number); return { date: { year: y, month: m, day: d } }; }
function deepFind(obj, re, depth = 0) {
  if (obj == null || depth > 6 || typeof obj !== 'object') return null;
  for (const [k, v] of Object.entries(obj)) {
    if (re.test(k)) {
      if (typeof v === 'number') return v;
      if (typeof v === 'string' && v !== '' && !isNaN(Number(v))) return Number(v);
      if (typeof v === 'object') { const n = deepFind(v, /./, depth + 1); if (n != null) return n; }
    }
  }
  for (const v of Object.values(obj)) { const n = deepFind(v, re, depth + 1); if (n != null) return n; }
  return null;
}

export async function ghToken() {
  const cached = await getSetting('gh_access_token');
  const exp = Number(await getSetting('gh_access_exp') || 0);
  if (cached && exp - Date.now() > 90000) return cached;
  const refresh = await getSetting('gh_refresh_token');
  if (!refresh) throw Object.assign(new Error('Google Health is not connected'), { code: 'not_connected' });
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refresh,
      client_id: process.env.GH_CLIENT_ID, client_secret: process.env.GH_CLIENT_SECRET }),
  });
  const tok = await r.json();
  if (!r.ok || !tok.access_token) {
    await setSetting('gh_status', 'reconnect');
    throw Object.assign(new Error('Google Health link expired: ' + (tok.error || r.status)), { code: 'reconnect' });
  }
  await setSetting('gh_access_token', tok.access_token);
  await setSetting('gh_access_exp', String(Date.now() + (tok.expires_in || 3600) * 1000));
  return tok.access_token;
}

async function gh(token, path, opts = {}) {
  const r = await fetch(`${GH}/${path}`, { ...opts, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(opts.headers || {}) } });
  return { ok: r.ok, status: r.status, body: await r.json().catch(() => ({})) };
}

export async function fetchSteps(token, date, raw) {
  const res = await gh(token, 'steps/dataPoints:dailyRollUp', { method: 'POST', body: JSON.stringify({ range: { start: civil(date), end: civil(nextDay(date)) } }) });
  if (raw) raw.steps = res.body;
  if (!res.ok) return undefined;
  const v = deepFind((res.body.rollupDataPoints || [])[0]?.steps, /countSum|count/);
  return v != null ? Math.round(v) : undefined;
}
export async function fetchSleep(token, date, raw) {
  const f = `sleep.interval.civil_end_time >= "${date}" AND sleep.interval.civil_end_time < "${nextDay(date)}"`;
  const res = await gh(token, `sleep/dataPoints?pageSize=25&filter=${encodeURIComponent(f)}`);
  if (raw) raw.sleep = res.body;
  if (!res.ok) return undefined;
  let mins = 0;
  for (const p of res.body.dataPoints || []) {
    const s = p.sleep || {};
    if (s.metadata && s.metadata.nap) continue;
    const m = Number(s.summary?.minutesAsleep);
    if (isFinite(m)) mins += m;
  }
  return mins > 0 ? Math.floor(mins / 60) + ':' + String(mins % 60).padStart(2, '0') : undefined;
}
export async function fetchWeight(token, date, raw) {
  const f = `weight.sample_time.civil_time >= "${date}" AND weight.sample_time.civil_time < "${nextDay(date)}"`;
  const res = await gh(token, `weight/dataPoints?pageSize=100&filter=${encodeURIComponent(f)}`);
  if (raw) raw.weight = res.body;
  if (!res.ok || !(res.body.dataPoints || []).length) return undefined;
  const w = res.body.dataPoints[res.body.dataPoints.length - 1].weight;
  let kg = deepFind(w, /kilogram|^kg$|kgs/i);
  if (kg == null) { const g = deepFind(w, /gram/i); if (g != null) kg = g / 1000; }
  if (kg == null) { const lb = deepFind(w, /pound|lb/i); if (lb != null) kg = lb * 0.45359237; }
  return (kg != null && kg > 20 && kg < 300) ? Math.round(kg * 10) / 10 : undefined;
}
function londonDay(iso) {
  const t = Date.parse(iso);
  if (!isFinite(t)) return null;
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(t));
}
function civilDay(c) {
  if (!c) return null;
  if (typeof c === 'string') return /^\d{4}-\d{2}-\d{2}/.test(c) ? c.slice(0, 10) : null;
  const d = c.date || c;
  if (d && d.year && d.month && d.day) return `${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`;
  return null;
}
function seconds(v) { const n = parseFloat(String(v == null ? '' : v)); return isFinite(n) ? n : null; }
// Boils one exercise data point down to { type, day, mins }. The day is the day the session ended.
export function describeSession(p) {
  const e = (p && p.exercise) || {};
  const i = e.interval || {};
  const day = civilDay(i.civilEndTime) || londonDay(i.endTime) || civilDay(i.civilStartTime) || londonDay(i.startTime);
  let mins = null;
  const a = Date.parse(i.startTime), b = Date.parse(i.endTime);
  if (isFinite(a) && isFinite(b) && b > a) mins = Math.round((b - a) / 60000);
  if (mins == null) { const sec = seconds(e.activeDuration ?? e.duration ?? e.metricsSummary?.activeDuration); if (sec != null) mins = Math.round(sec / 60); }
  const type = String(e.exerciseType || e.activityType || e.type || 'UNKNOWN').toUpperCase();
  return { type, day, mins };
}
export function isWorkout(s) { return !NOT_WORKOUT.has(s.type) && (s.mins == null || s.mins >= MIN_WORKOUT_MINUTES); }

// Any real exercise session that ended on the date counts (the same idea as Google's "exercise days").
// Returns true/false when the query worked (so gym can be switched off), undefined when it didn't.
export async function fetchGym(token, date, raw) {
  const prev = new Date(Date.parse(date + 'T12:00:00Z') - 86400000).toISOString().slice(0, 10);
  const f = `exercise.interval.civil_start_time >= "${prev}" AND exercise.interval.civil_start_time < "${nextDay(date)}"`;
  let res = await gh(token, `exercise/dataPoints?pageSize=50&filter=${encodeURIComponent(f)}`);
  let how = 'filtered';
  if (!res.ok) {                       // filter not accepted: fall back to the most recent sessions
    if (raw) raw.exerciseFilterError = res.body;
    res = await gh(token, 'exercise/dataPoints?pageSize=50'); how = 'unfiltered';
  }
  if (raw) raw.exercise = res.body;
  if (!res.ok) {
    await setSetting('gh_last_exercise', JSON.stringify({ date, ok: false, status: res.status, error: (res.body?.error?.message || '').slice(0, 160) }));
    return undefined;
  }
  const sessions = (res.body.dataPoints || []).map(describeSession).filter(s => s.day === date);
  if (raw) { raw.exerciseSessions = sessions; raw.exerciseQuery = how; }
  await setSetting('gh_last_exercise', JSON.stringify({ date, ok: true, how, sessions: sessions.slice(0, 6) }));
  return sessions.some(isWorkout);
}

export async function googleDay(date, only, raw) {
  const token = await ghToken();
  const want = k => !only || only.includes(k);
  const [steps, sleep, bodyweight, gym] = await Promise.all([
    want('steps') ? fetchSteps(token, date, raw) : undefined,
    want('sleep') ? fetchSleep(token, date, raw) : undefined,
    want('bodyweight') ? fetchWeight(token, date, raw) : undefined,
    want('gym') ? fetchGym(token, date, raw) : undefined,
  ]);
  const patch = {};
  if (steps !== undefined) patch.steps = steps;
  if (sleep !== undefined) patch.sleep = sleep;
  if (bodyweight !== undefined) patch.bodyweight = bodyweight;
  if (gym !== undefined) patch.gym = gym;
  return patch;
}
