// Called by Vercel Cron at 20:00 UTC. Works out what is still outstanding for
// today and pushes a single notification. Sends nothing if the day is done.

import webpush from 'web-push';

const SCRIPT_URL = process.env.APPS_SCRIPT_URL ||
  'https://script.google.com/macros/s/AKfycbxL5R049IdcNE7AGr93pTL9MwYgfFlkdkxBDAPpxwr0sXrRzIXnxLlTT-dYZ0hkEw-evA/exec';

// Mood only became required from this date — matches the app's own rule.
const MOOD_REQUIRED_FROM = '2026-08-12';

// London date, not UTC: at 20:00 UTC in summer it is already 21:00 locally,
// and using the UTC date would be wrong either side of midnight.
function londonToday() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date());
}

// Same fields the ring counts, in the order they appear in the app.
function outstanding(row, date) {
  if (!row) {
    const base = ['Steps', 'Bodyweight', 'Calories', 'Sleep', 'HackChinese', 'DuChinese', 'Yoyo'];
    return date >= MOOD_REQUIRED_FROM ? base.concat('Mood') : base;
  }
  const missing = [];
  if (!row.steps) missing.push('Steps');
  if (!row.bodyweight) missing.push('Bodyweight');
  if (!row.calories) missing.push('Calories');
  if (!row.sleep) missing.push('Sleep');
  if (date >= MOOD_REQUIRED_FROM && !row.mood) missing.push('Mood');
  if (!row.hackChinese) missing.push('HackChinese');
  if (!row.duChinese) missing.push('DuChinese');
  if (!row.yoyoChinese) missing.push('Yoyo');
  return missing;
}

export default async function handler(req, res) {
  // Vercel signs cron requests; reject anything else in production
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.authorization || '';
    if (auth !== `Bearer ${secret}`) return res.status(401).json({ error: 'Unauthorized' });
  }

  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return res.status(500).json({ error: 'VAPID keys not configured' });
  webpush.setVapidDetails('mailto:tracker@example.com', pub, priv);

  try {
    const today = londonToday();

    const [rowsRes, subRes] = await Promise.all([
      fetch(`${SCRIPT_URL}?action=getAll`, { redirect: 'follow' }).then(r => r.text()),
      fetch(`${SCRIPT_URL}?action=getSubscription`, { redirect: 'follow' }).then(r => r.text())
    ]);

    let rows, subWrap;
    try { rows = JSON.parse(rowsRes).rows || []; }
    catch (e) { return res.status(502).json({ error: 'getAll did not return JSON', preview: rowsRes.slice(0, 160) }); }
    try { subWrap = JSON.parse(subRes); }
    catch (e) { return res.status(502).json({ error: 'getSubscription did not return JSON', preview: subRes.slice(0, 160) }); }

    if (!subWrap.subscription) {
      return res.status(200).json({ sent: false, reason: 'no subscription stored' });
    }

    const row = rows.find(r => r.date === today);
    const missing = outstanding(row, today);

    if (missing.length === 0) {
      return res.status(200).json({ sent: false, reason: 'day already complete', date: today });
    }

    const payload = JSON.stringify({
      title: `${missing.length} action${missing.length === 1 ? '' : 's'} left today`,
      body: missing.join(' · ')
    });

    let sub;
    try { sub = JSON.parse(subWrap.subscription); }
    catch (e) { return res.status(500).json({ error: 'stored subscription is not valid JSON' }); }

    try {
      await webpush.sendNotification(sub, payload);
    } catch (err) {
      // 404/410 mean the browser dropped the subscription — clear it so we stop trying
      if (err.statusCode === 404 || err.statusCode === 410) {
        await fetch(SCRIPT_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({ action: 'saveSubscription', subscription: '' }),
          redirect: 'follow'
        });
        return res.status(200).json({ sent: false, reason: 'subscription expired, cleared' });
      }
      throw err;
    }

    return res.status(200).json({ sent: true, date: today, count: missing.length, missing });
  } catch (err) {
    return res.status(500).json({ error: String(err && err.message || err) });
  }
}
