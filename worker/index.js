// Cloudflare Worker entry: /api/* runs the news pipeline, everything else is the static site in ./site
import { onRequestGet as news } from '../functions/api/news.js';
import { onRequestPost as refresh, onRequestGet as refreshGet } from '../functions/api/refresh.js';
import { onRequestGet as status } from '../functions/api/status.js';
import { onRequestGet as brief } from '../functions/api/brief.js';

const ROUTES = { 'GET /api/news': news, 'POST /api/refresh': refresh, 'GET /api/refresh': refreshGet, 'GET /api/status': status, 'GET /api/brief': brief };

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
