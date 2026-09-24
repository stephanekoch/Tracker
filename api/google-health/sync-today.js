// Cron wrapper: sync today's partial numbers (steps so far, sleep, weight) ahead of the evening reminder.
import sync from './sync.js';
export default function handler(req, res) { req.query = { ...(req.query || {}), today: '1' }; return sync(req, res); }
