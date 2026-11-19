// Cloudflare Worker entry: /api/* runs the news pipeline, everything else is the static site in ./site
import { onRequestGet as news } from '../functions/api/news.js';
import { onRequestPost as refresh } from '../functions/api/refresh.js';
import { onRequestGet as status } from '../functions/api/status.js';

const ROUTES = { 'GET /api/news': news, 'POST /api/refresh': refresh, 'GET /api/status': status };

export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);
    if (pathname.startsWith('/api/')) {
      const fn = ROUTES[`${request.method} ${pathname}`];
      if (!fn) return new Response(JSON.stringify({ ok: false, error: 'not found' }), { status: 404, headers: { 'content-type': 'application/json' } });
      return fn({ env, request, waitUntil: p => ctx.waitUntil(p) });
    }
    return env.ASSETS.fetch(request);
  },
};
