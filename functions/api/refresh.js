// POST /api/refresh -> rebuild the shared edition from the newswires (one at a time, rate limited).
import { runRefresh } from '../../lib/pipeline.js';
import { kv, getLatest, getMeta, putMeta, json, STALE_MS, MANUAL_MIN_MS, LOCK_MS } from '../../lib/store.js';

export async function onRequestPost({ env, request }) {
  try {
    const manual = new URL(request.url).searchParams.get('manual') === '1';
    const [prev, meta] = await Promise.all([getLatest(env), getMeta(env)]);
    const age = prev ? Date.now() - Date.parse(prev.updated) : Infinity;
    if (meta.lockUntil && meta.lockUntil > Date.now()) return json({ ok: true, status: 'busy', payload: prev });
    if (age < (manual ? MANUAL_MIN_MS : STALE_MS)) return json({ ok: true, status: 'recent', payload: prev, ageMin: Math.round(age / 60000) });

    await putMeta(env, { ...meta, lockUntil: Date.now() + LOCK_MS });
    const t0 = Date.now();
    const { payload, log, feedItems, newEvents } = await runRefresh(prev);
    await kv(env).put('latest', JSON.stringify(payload));
    await putMeta(env, { lockUntil: 0, lastRun: payload.updated, ms: Date.now() - t0, feedItems, newEvents, countries: Object.keys(payload.countries).length, log });
    return json({ ok: true, status: 'updated', payload });
  } catch (e) {
    try { const m = await getMeta(env); await putMeta(env, { ...m, lockUntil: 0, lastError: String(e.message || e), lastErrorAt: new Date().toISOString() }); } catch {}
    return json({ ok: false, error: String(e.message || e) }, 500);
  }
}
