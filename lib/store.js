// Shared KV helpers. The edition is shared by every visitor.
export const STALE_MS = 60 * 60e3;       // older than this -> refresh when someone opens the app
export const MANUAL_MIN_MS = 10 * 60e3;  // "Get latest" can't run more often than this
export const LOCK_MS = 90e3;             // a refresh in progress blocks others for this long

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
