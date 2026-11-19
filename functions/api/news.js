// GET /api/news -> the shared edition. If it's stale, a refresh starts in the background for everyone.
import { getLatest, getMeta, json, staleAfter } from '../../lib/store.js';
import { ENGINE } from '../../lib/pipeline.js';

export async function onRequestGet({ env, waitUntil }) {
  try {
    const [payload, meta] = await Promise.all([getLatest(env), getMeta(env)]);
    const age = payload && payload.engine === ENGINE ? Date.now() - Date.parse(payload.updated) : Infinity;
    const refreshing = !!(meta.lockUntil && meta.lockUntil > Date.now());
    // the app itself calls POST /api/refresh when this says stale (background work is cut off after ~30 s, too short for the AI step)
    return json({ ok: true, payload, ageMin: Number.isFinite(age) ? Math.round(age / 60000) : null, stale: age > staleAfter(payload), refreshing });
  } catch (e) {
    return json({ ok: false, error: String(e.message || e) }, 503);
  }
}
