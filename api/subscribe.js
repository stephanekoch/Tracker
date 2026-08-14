// Stores (or clears) the browser's push subscription. It lives in the sheet
// alongside everything else, so there is no new database to manage.

const SCRIPT_URL = process.env.APPS_SCRIPT_URL ||
  'https://script.google.com/macros/s/AKfycbxL5R049IdcNE7AGr93pTL9MwYgfFlkdkxBDAPpxwr0sXrRzIXnxLlTT-dYZ0hkEw-evA/exec';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const r = await fetch(SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'saveSubscription',
        subscription: body.subscription ? JSON.stringify(body.subscription) : ''
      }),
      redirect: 'follow'
    });
    const text = await r.text();
    try {
      return res.status(200).json(JSON.parse(text));
    } catch (e) {
      return res.status(502).json({ error: 'Apps Script did not return JSON', preview: text.slice(0, 200) });
    }
  } catch (err) {
    return res.status(500).json({ error: String(err && err.message || err) });
  }
}
