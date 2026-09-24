// Runs every source for a set of dates and records what happened.
import { applyAuto, setSetting, getSetting } from './core.js';
import { googleDay } from './google.js';
import { fatsecretCalories } from './fatsecret.js';

export async function runSync(dates, { google = true, fatsecret = true, only = null, raw = null } = {}) {
  const result = { dates: {}, errors: {} };
  if (google) {
    for (const d of dates) {
      try {
        const patch = await googleDay(d, only, raw);
        result.dates[d] = { ...(result.dates[d] || {}), google: await applyAuto(d, patch) };
      } catch (e) {
        result.errors.google = e.message;
        if (e.code === 'not_connected' || e.code === 'reconnect') break;
      }
    }
    if (!result.errors.google) { await setSetting('gh_status', 'connected'); await setSetting('gh_last_sync', new Date().toISOString()); await setSetting('gh_last_error', ''); }
    else await setSetting('gh_last_error', result.errors.google.slice(0, 300));
  }
  if (fatsecret) {
    try {
      const cals = await fatsecretCalories(dates, raw);
      for (const d of dates) if (cals[d] != null) result.dates[d] = { ...(result.dates[d] || {}), fatsecret: await applyAuto(d, { calories: cals[d] }) };
      await setSetting('fs_status', 'connected'); await setSetting('fs_last_sync', new Date().toISOString()); await setSetting('fs_last_error', '');
    } catch (e) {
      result.errors.fatsecret = e.message;
      if (e.code === 'reconnect') await setSetting('fs_status', 'reconnect');
      await setSetting('fs_last_error', e.message.slice(0, 300));
    }
  }
  return result;
}

// Throttle for app-open / webhook-triggered FatSecret refreshes
export async function fatsecretDue(minutes = 10) {
  const last = Date.parse((await getSetting('fs_last_sync')) || 0) || 0;
  return Date.now() - last > minutes * 60000;
}
