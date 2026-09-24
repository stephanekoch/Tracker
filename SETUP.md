# Google Health sync — setup

## 1. Google Cloud (one-off, ~10 min)
1. https://console.cloud.google.com → New project (e.g. "tracker").
2. APIs & Services → Library → search "Google Health API" → Enable.
3. APIs & Services → OAuth consent screen → External → app name + your email → Save.
   - Scopes: add the four `googlehealth.*.readonly` scopes (activity_and_fitness, health_metrics_and_measurements, sleep, nutrition).
   - Test users: add your Gmail address. Leave Publishing status = **Testing**.
4. APIs & Services → Credentials → Create credentials → OAuth client ID → Web application.
   - Authorised redirect URI: `https://tracker-drab-three.vercel.app/api/google-health/callback`
   - Copy the Client ID and Client secret.

## 2. Vercel
Project → Settings → Environment Variables → add `GH_CLIENT_ID` and `GH_CLIENT_SECRET`. Redeploy.

## 3. Supabase
Run `tracker_settings.sql` (harmless if the table already exists).

## 4. GitHub
Upload `index.html`, `vercel.json` and the four files under `api/google-health/`.

## 5. Connect
Tracker → Log tab → **Connect** next to Google Health → approve → **Sync now**.
First time, also open
`https://tracker-drab-three.vercel.app/api/google-health/sync?date=2026-09-23&debug=1`
and send me the JSON so I can confirm the field names Google returns for weight and calories.

## What syncs
- Steps · sleep (main sleep, naps excluded) · bodyweight (last reading of the day) · calories eaten (if nutrition data reaches Google Health) · gym (switched on when a strength-type exercise session exists).
- Cron: 05:30 UTC for yesterday (final), 17:30 UTC for today so far (before the 18:00 reminder).
- Mood and Chinese are never touched. A synced value overwrites a manual one for that field.

## Weekly reconnect
In Testing mode Google expires the link after 7 days; the strip then shows **Reconnect**. One tap.
