# Tracker — automatic sync setup

Everything below is one-off.

## 1. Supabase
SQL Editor → run `tracker_auto_fields.sql` (adds the manual-override column; safe to re-run).

## 2. FatSecret (calories)
1. Start logging food in the **FatSecret** app (free) instead of MyFitnessPal.
2. Go to https://platform.fatsecret.com/register → create a free developer account → create an API key.
3. Copy the **Consumer Key** and **Consumer Secret** (the OAuth 1.0 pair — not Client ID / Client Secret).
   The IP-restriction settings there only apply to OAuth 2.0, so you can ignore them.

## 3. Vercel → Settings → Environment Variables
| Key | Value | Sensitive |
|---|---|---|
| `GH_WEBHOOK_SECRET` | `kWONQDgVHlYh_TyU2uShlaatywcBZ0-z` | yes |
| `FS_CONSUMER_KEY` | FatSecret Consumer Key | no |
| `FS_CONSUMER_SECRET` | FatSecret Consumer Secret | yes |

(`GH_CLIENT_ID` / `GH_CLIENT_SECRET` stay as they are.)

## 4. GitHub
Upload the contents of this zip (drag everything, including the `api` folder). Wait for Vercel → **Ready**.

## 5. Connect FatSecret
Tracker → Log tab → tap the **FatSecret · connect** chip → sign in → approve.
If you land on a "FatSecret blocked the connection" page, their bot protection refused Vercel; the page explains the Postman workaround.

## 6. Register the Google webhook
Open https://tracker-drab-three.vercel.app/api/google-health/register and follow the three steps (paste into Google's "Try it" panel).
You'll need your Google Cloud **project number** (Cloud console home page → Project info).

## 7. Check
Tap the version label (v74) in the app → the diagnostics panel shows both connections and has a **Pull now** button.

## How it behaves
- Gym, steps, bodyweight, sleep: from Google Health, pushed by webhook within minutes of your phone syncing.
- Calories: from FatSecret — refreshed when you open the app, whenever a Google update arrives (max every 15 min), and by the crons.
- Safety-net crons: 05:30 and 20:30 UTC.
- Tap ✎ on any auto field to type a value by hand; that day's value is then never overwritten. "make automatic" undoes it.
- The evening reminder now only mentions mood and Chinese.
