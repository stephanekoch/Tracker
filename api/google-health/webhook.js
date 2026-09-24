// Receives Google Health notifications and refreshes only what changed.
import { isRecentDate } from '../_lib/core.js';
import { runSync, fatsecretDue } from '../_lib/run.js';

const TYPE_TO_FIELD = { steps: 'steps', sleep: 'sleep', weight: 'bodyweight', exercise: 'gym' };

function datesFor(n) {
  const out = new Set();
  const type = n.dataType;
  for (const iv of n.intervals || []) {
    const s = (iv.civilIso8601TimeInterval?.startTime || '').slice(0, 10);
    const e = (iv.civilIso8601TimeInterval?.endTime || '').slice(0, 10);
    const eFull = iv.civilIso8601TimeInterval?.endTime || '';
    if (type === 'sleep' || type === 'exercise') { if (e) out.add(e); }       // assigned to the day it ends
    else {
      if (s) out.add(s);
      if (e && e !== s && !/T00:00:00/.test(eFull)) out.add(e);             // spans past midnight
    }
  }
  return [...out];
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const expected = `Bearer ${process.env.GH_WEBHOOK_SECRET || ''}`;
  if (!process.env.GH_WEBHOOK_SECRET || req.headers['authorization'] !== expected) return res.status(401).end();

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  if (body && body.type === 'verification') return res.status(201).json({ ok: true });

  const items = (Array.isArray(body) ? body : [body]).map(x => x && x.data).filter(Boolean);
  const work = {};   // date -> Set(fields)
  for (const n of items) {
    if (n.operation !== 'UPSERT' && n.operation !== 'DELETE') continue;
    const field = TYPE_TO_FIELD[n.dataType];
    if (!field) continue;
    for (const d of datesFor(n)) if (isRecentDate(d)) (work[d] ||= new Set()).add(field);
  }
  try {
    for (const [d, fields] of Object.entries(work)) await runSync([d], { fatsecret: false, only: [...fields] });
    // Piggy-back a calorie refresh while we're awake, at most every 15 minutes
    const dates = Object.keys(work);
    if (dates.length && await fatsecretDue(15)) await runSync(dates.slice(-1), { google: false });
  } catch (e) { /* respond 204 regardless; crons will catch up */ }
  return res.status(204).end();
}
