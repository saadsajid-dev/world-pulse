// Shared KV helpers. The edition is shared by every visitor.
export const STALE_MS = 60 * 60e3;       // older than this -> refresh when someone opens the app
export const MANUAL_MIN_MS = 10 * 60e3;  // "Get latest" can't run more often than this
export const LOCK_MS = 90e3;
export const PENDING_MS = 90e3;          // stories still waiting for AI labels -> next refresh may run this soon
export const staleAfter = p => (p?.pending ? PENDING_MS : STALE_MS);             // a refresh in progress blocks others for this long

export const json = (obj, status = 200, extra = {}) => new Response(JSON.stringify(obj), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extra },
});

export function kv(env) {
  if (!env.NEWS) throw new Error('KV binding "NEWS" is not set up on this Pages project yet');
  return env.NEWS;
}
export async function getLatest(env) { return kv(env).get('latest', 'json'); }
export async function getMeta(env) { return (await kv(env).get('meta', 'json')) || {}; }
export async function putMeta(env, m) { await kv(env).put('meta', JSON.stringify(m)); }

import { runRefresh, ENGINE } from './pipeline.js';
/** Rebuild the shared edition unless it is fresh or another refresh is running. */
export async function refreshEdition(env, { manual = false } = {}) {
  const [prev, meta] = await Promise.all([getLatest(env), getMeta(env)]);
  const age = prev && prev.engine === ENGINE ? Date.now() - Date.parse(prev.updated) : Infinity;
  if (meta.lockUntil && meta.lockUntil > Date.now()) return { ok: true, status: 'busy', payload: prev };
  if (age < (manual ? Math.min(MANUAL_MIN_MS, staleAfter(prev)) : staleAfter(prev))) return { ok: true, status: 'recent', payload: prev, ageMin: Math.round(age / 60000) };
  await putMeta(env, { ...meta, lockUntil: Date.now() + LOCK_MS });
  const t0 = Date.now();
  try {
    const { payload, log, feedItems, newEvents } = await runRefresh(prev, fetch, Date.now(), env, s => putMeta(env, { ...meta, lockUntil: Date.now() + LOCK_MS, stage: s }).catch(() => {}));
    await kv(env).put('latest', JSON.stringify(payload));
    await putMeta(env, { lockUntil: 0, lastRun: payload.updated, ms: Date.now() - t0, feedItems, newEvents, countries: Object.keys(payload.countries).length, scoring: payload.scoring, log });
    return { ok: true, status: 'updated', payload };
  } catch (e) {
    await putMeta(env, { ...meta, lockUntil: 0, lastError: String(e.message || e), lastErrorAt: new Date().toISOString() }).catch(() => {});
    throw e;
  }
}
