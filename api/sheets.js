const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxL5R049IdcNE7AGr93pTL9MwYgfFlkdkxBDAPpxwr0sXrRzIXnxLlTT-dYZ0hkEw-evA/exec";

export default async function handler(req, res) {
  // Allow requests from any origin (your Vercel app)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  // Handle preflight
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  try {
    let response;

    if (req.method === "GET") {
      const params = new URLSearchParams(req.query).toString();
      response = await fetch(`${APPS_SCRIPT_URL}?${params}`, {
        method: "GET",
        redirect: "follow",
      });
    } else if (req.method === "POST") {
      const body = typeof req.body === "string" ? req.body : JSON.stringify(req.body);
      response = await fetch(APPS_SCRIPT_URL, {
        method: "POST",
        body,
        redirect: "follow",
      });
    }

    const data = await response.json();
    return res.status(200).json(data);

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
