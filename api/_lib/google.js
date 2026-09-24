// Google Health API: token handling and one fetcher per metric.
import { getSetting, setSetting, nextDay } from './core.js';
const GH = 'https://health.googleapis.com/v4/users/me/dataTypes';
export const GYM_TYPES = new Set(['STRENGTH_TRAINING','WEIGHTLIFTING','WEIGHTS','FREE_WEIGHTS','WEIGHT_MACHINES','POWERLIFTING',
  'FUNCTIONAL_STRENGTH_TRAINING','CIRCUIT_TRAINING','CROSSFIT','HIIT','BODY_WEIGHT','CALISTHENICS','WORKOUT','CROSS_TRAINING',
  'BOOTCAMP','TRX','CORE_TRAINING','RESISTANCE_BANDS','TABATA_WORKOUT','INTERVAL_WORKOUT']);

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
// Returns true/false when the query worked (so gym can be switched off), undefined when it didn't.
export async function fetchGym(token, date, raw) {
  const f = `exercise.interval.civil_end_time >= "${date}" AND exercise.interval.civil_end_time < "${nextDay(date)}"`;
  const res = await gh(token, `exercise/dataPoints?pageSize=25&filter=${encodeURIComponent(f)}`);
  if (raw) raw.exercise = res.body;
  if (!res.ok) return undefined;
  const types = (res.body.dataPoints || []).map(p => p.exercise?.exerciseType).filter(Boolean);
  if (raw) raw.exerciseTypes = types;
  return types.some(t => GYM_TYPES.has(t));
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
