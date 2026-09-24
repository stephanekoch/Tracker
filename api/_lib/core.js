// Shared helpers: Supabase access, settings store, London dates, safe upsert.
export const SUPABASE_URL = 'https://bhyjfyjydbaeoxipvsqq.supabase.co';
const SUPABASE_KEY = 'sb_publishable_N4rk_9nA_oVu6AHC8qW4tQ_pARMMDLW';
export const SB = { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' };
export const APP_URL = 'https://tracker-drab-three.vercel.app';

// Fields that are filled automatically. Anything listed in a row's manual_fields
// was typed in by hand and is never overwritten by a sync.
export const AUTO_FIELDS = ['gym', 'steps', 'bodyweight', 'calories', 'sleep'];

export async function getSetting(key) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/tracker_settings?key=eq.${encodeURIComponent(key)}&select=value`, { headers: SB });
  if (!r.ok) return null;
  const rows = await r.json();
  return rows.length ? rows[0].value : null;
}
export async function getSettings(prefix) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/tracker_settings?key=like.${encodeURIComponent(prefix)}*&select=key,value`, { headers: SB });
  if (!r.ok) return {};
  return Object.fromEntries((await r.json()).map(x => [x.key, x.value]));
}
export async function setSetting(key, value) {
  await fetch(`${SUPABASE_URL}/rest/v1/tracker_settings?on_conflict=key`, {
    method: 'POST', headers: { ...SB, Prefer: 'return=minimal,resolution=merge-duplicates' },
    body: JSON.stringify({ key, value: value == null ? '' : String(value), updated_at: new Date().toISOString() }),
  });
}

export function londonDate(offsetDays = 0) {
  const d = new Date(Date.now() + offsetDays * 86400000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}
export function nextDay(iso) { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); }
export function isRecentDate(iso, maxDaysBack = 60) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || '')) return false;
  const today = londonDate(0);
  if (iso > today) return false;
  const oldest = new Date(Date.parse(today + 'T12:00:00Z') - maxDaysBack * 86400000).toISOString().slice(0, 10);
  return iso >= oldest;
}

// Write auto values for one date. The provider's value is always recorded in
// auto_values (so the app can show "Synced 67.6 kg" next to an override), but a
// field the user set by hand is never overwritten.
export async function applyAuto(date, patch) {
  const keys = Object.keys(patch).filter(k => AUTO_FIELDS.includes(k) && patch[k] !== undefined);
  if (!keys.length) return { wrote: false, skipped: [] };
  const r = await fetch(`${SUPABASE_URL}/rest/v1/tracker_entries?date=eq.${date}&select=date,manual_fields,auto_values`, { headers: SB });
  const rows = r.ok ? await r.json() : [];
  const manual = new Set((rows[0] && rows[0].manual_fields) || []);
  const autoValues = { ...((rows[0] && rows[0].auto_values) || {}) };
  const clean = {}; const skipped = [];
  for (const k of keys) { autoValues[k] = patch[k]; if (manual.has(k)) skipped.push(k); else clean[k] = patch[k]; }
  const body = { ...clean, auto_values: autoValues };
  const w = rows.length
    ? await fetch(`${SUPABASE_URL}/rest/v1/tracker_entries?date=eq.${date}`, { method: 'PATCH', headers: { ...SB, Prefer: 'return=minimal' }, body: JSON.stringify(body) })
    : await fetch(`${SUPABASE_URL}/rest/v1/tracker_entries`, { method: 'POST', headers: { ...SB, Prefer: 'return=minimal' }, body: JSON.stringify({ date, ...body }) });
  if (!w.ok) throw new Error('Supabase write failed: ' + (await w.text()).slice(0, 200));
  return { wrote: Object.keys(clean).length > 0, fields: clean, skipped };
}
