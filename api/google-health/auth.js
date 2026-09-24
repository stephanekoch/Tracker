// Starts the Google Health OAuth flow. Open this URL in the browser.
const REDIRECT_URI = 'https://tracker-drab-three.vercel.app/api/google-health/callback';
const SCOPES = [
  'https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly',
  'https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly',
  'https://www.googleapis.com/auth/googlehealth.sleep.readonly',
  'https://www.googleapis.com/auth/googlehealth.nutrition.readonly',
];
export default async function handler(req, res) {
  if (!process.env.GH_CLIENT_ID) return res.status(500).send('GH_CLIENT_ID is not set in Vercel env vars');
  const p = new URLSearchParams({
    client_id: process.env.GH_CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent',          // forces a refresh_token to be issued every time (needed for weekly reconnects)
  });
  res.writeHead(302, { Location: 'https://accounts.google.com/o/oauth2/v2/auth?' + p.toString() });
  res.end();
}
