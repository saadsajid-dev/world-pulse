// GET /api/status -> diagnostics for the last refresh (no secrets).
import { getMeta, json } from '../../lib/store.js';
export async function onRequestGet({ env }) {
  try { return json({ ok: true, bindings: { NEWS: !!env.NEWS, AI: !!env.AI }, meta: await getMeta(env) }); }
  catch (e) { return json({ ok: false, bindings: { NEWS: !!env.NEWS, AI: !!env.AI }, error: String(e.message || e) }, 503); }
}
