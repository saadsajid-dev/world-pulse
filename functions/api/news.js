// GET /api/news -> the shared edition, plus whether it's due for a refresh.
import { getLatest, getMeta, json, STALE_MS, LOCK_MS } from '../../lib/store.js';

export async function onRequestGet({ env }) {
  try {
    const [payload, meta] = await Promise.all([getLatest(env), getMeta(env)]);
    const age = payload ? Date.now() - Date.parse(payload.updated) : Infinity;
    const refreshing = !!(meta.lockUntil && meta.lockUntil > Date.now());
    return json({ ok: true, payload, ageMin: Number.isFinite(age) ? Math.round(age / 60000) : null, stale: age > STALE_MS, refreshing });
  } catch (e) {
    return json({ ok: false, error: String(e.message || e) }, 503);
  }
}
