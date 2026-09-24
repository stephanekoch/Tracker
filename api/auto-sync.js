// GET /api/auto-sync                 → today + yesterday, all sources (crons use this)
// GET /api/auto-sync?date=YYYY-MM-DD  → one date
// GET /api/auto-sync?light=1          → app open: Google today only, FatSecret only if >10 min since last
// Add &debug=1 to see the raw provider payloads.
import { londonDate, isRecentDate } from './_lib/core.js';
import { runSync, fatsecretDue } from './_lib/run.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');
  const q = req.query || {};
  const raw = q.debug === '1' ? {} : null;
  try {
    let dates, opts = { raw };
    if (q.date) {
      if (!isRecentDate(q.date, 365)) return res.status(400).json({ ok: false, error: 'date must be within the last year' });
      dates = [q.date];
    } else if (q.light === '1') {
      dates = [londonDate(0)];
      opts.fatsecret = await fatsecretDue(10);
    } else {
      dates = [londonDate(-1), londonDate(0)];
    }
    const out = await runSync(dates, opts);
    return res.status(200).json({ ok: true, ...out, ...(raw ? { raw } : {}) });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e.message || e), ...(raw ? { raw } : {}) });
  }
}
