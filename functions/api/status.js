// GET /api/status -> diagnostics for the last refresh (no secrets).
import { getMeta, json } from '../../lib/store.js';
export async function onRequestGet({ env }) {
  try { return json({ ok: true, bindings: { NEWS: !!env.NEWS, AI: !!env.AI, CLAUDE: !!env.ANTHROPIC_API_KEY }, meta: await getMeta(env) }); }
  catch (e) { return json({ ok: false, bindings: { NEWS: !!env.NEWS, AI: !!env.AI, CLAUDE: !!env.ANTHROPIC_API_KEY }, error: String(e.message || e) }, 503); }
}
