// GET /api/news -> the shared edition. If it's stale, a refresh starts in the background for everyone.
import { getLatest, getMeta, json, refreshEdition, STALE_MS } from '../../lib/store.js';

export async function onRequestGet({ env, waitUntil }) {
  try {
    const [payload, meta] = await Promise.all([getLatest(env), getMeta(env)]);
    const age = payload ? Date.now() - Date.parse(payload.updated) : Infinity;
    let refreshing = !!(meta.lockUntil && meta.lockUntil > Date.now());
    if (age > STALE_MS && !refreshing && waitUntil) { waitUntil(refreshEdition(env).catch(() => {})); refreshing = true; }
    return json({ ok: true, payload, ageMin: Number.isFinite(age) ? Math.round(age / 60000) : null, stale: age > STALE_MS, refreshing });
  } catch (e) {
    return json({ ok: false, error: String(e.message || e) }, 503);
  }
}
