// FatSecret: OAuth 1.0a signing (HMAC-SHA1) and daily calorie totals.
import crypto from 'node:crypto';
import { getSetting } from './core.js';
const API = 'https://platform.fatsecret.com/rest/server.api';
export const FS_AUTH = 'https://authentication.fatsecret.com/oauth';

const enc = s => encodeURIComponent(String(s)).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());

export function signedParams(method, url, params, tokenSecret = '') {
  const all = {
    oauth_consumer_key: process.env.FS_CONSUMER_KEY,
    oauth_nonce: crypto.randomBytes(12).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: String(Math.floor(Date.now() / 1000)),
    oauth_version: '1.0',
    ...params,
  };
  const norm = Object.keys(all).sort().map(k => `${enc(k)}=${enc(all[k])}`).join('&');
  const base = `${method.toUpperCase()}&${enc(url)}&${enc(norm)}`;
  const key = `${enc(process.env.FS_CONSUMER_SECRET)}&${enc(tokenSecret)}`;
  all.oauth_signature = crypto.createHmac('sha1', key).update(base).digest('base64');
  return all;
}

async function creds() {
  const token = (await getSetting('fs_token')) || process.env.FS_ACCESS_TOKEN;
  const secret = (await getSetting('fs_secret')) || process.env.FS_ACCESS_SECRET;
  if (!token || !secret) throw Object.assign(new Error('FatSecret is not connected'), { code: 'not_connected' });
  return { token, secret };
}
export const dateInt = iso => { const [y, m, d] = iso.split('-').map(Number); return Math.floor(Date.UTC(y, m - 1, d) / 86400000); };

// Calories eaten for each requested date (dates in the same month share one call).
export async function fatsecretCalories(dates, raw) {
  const { token, secret } = await creds();
  const byMonth = {};
  for (const d of dates) (byMonth[d.slice(0, 7)] ||= []).push(d);
  const out = {};
  for (const [month, ds] of Object.entries(byMonth)) {
    const p = signedParams('GET', API, { method: 'food_entries.get_month.v2', date: String(dateInt(ds[0])), format: 'json', oauth_token: token }, secret);
    const r = await fetch(API + '?' + new URLSearchParams(p).toString());
    const body = await r.json().catch(() => ({}));
    if (raw) raw['fatsecret_' + month] = body;
    if (body.error) throw Object.assign(new Error('FatSecret: ' + (body.error.message || JSON.stringify(body.error))), { code: body.error.code === 9 ? 'reconnect' : 'error' });
    let days = body.month && body.month.day;
    if (days && !Array.isArray(days)) days = [days];
    const map = Object.fromEntries((days || []).map(x => [String(x.date_int), Number(x.calories)]));
    for (const d of ds) { const c = map[String(dateInt(d))]; if (isFinite(c) && c > 0) out[d] = Math.round(c); }
  }
  return out;
}
