// GET /api/brief?c=<country>&t=<filter> -> a short AI briefing for that country (and filter), cached for everyone
import { getBrief } from '../../lib/brief.js';
import { json } from '../../lib/store.js';
export async function onRequestGet({ env, request }) {
  try {
    const u = new URL(request.url);
    const c = (u.searchParams.get('c') || '').slice(0, 80), t = (u.searchParams.get('t') || 'all').slice(0, 20);
    if (!c) return json({ ok: false, error: 'missing country' }, 400);
    return json(await getBrief(env, c, t));
  } catch (e) { return json({ ok: false, error: String(e.message || e) }, 500); }
}
