// node test/functions.test.mjs — runs the Pages Functions against an in-memory KV and fake feeds
import { onRequestGet as news } from '../functions/api/news.js';
import { onRequestPost as refresh } from '../functions/api/refresh.js';
import { onRequestGet as status } from '../functions/api/status.js';
const mem = new Map(); const pend = [];
const NEWS = { async get(k, type) { const v = mem.get(k); return v == null ? null : type === 'json' ? JSON.parse(v) : v; }, async put(k, v) { mem.set(k, v); } };
globalThis.fetch = async url => new Response(`<rss><channel><item><title>Israeli strikes kill 30 in Gaza</title><link>https://ex.com/${encodeURIComponent(url)}</link><pubDate>${new Date().toUTCString()}</pubDate></item></channel></rss>`);
const call = async (fn, url, env = { NEWS }) => (await fn({ env, request: new Request(url, { method: 'POST' }), waitUntil: p => pend.push(p) })).json();
console.log('no binding  ', await call(news, 'https://x/api/news', {}));
let j = await call(news, 'https://x/api/news'); console.log('empty       ', { stale: j.stale, payload: !!j.payload });
j = await call(refresh, 'https://x/api/refresh'); console.log('refresh     ', j.status, Object.keys(j.payload.countries));
j = await call(refresh, 'https://x/api/refresh?manual=1'); console.log('again       ', j.status, j.ageMin);
j = await call(news, 'https://x/api/news'); console.log('news        ', { stale: j.stale, ageMin: j.ageMin, events: j.payload.events.length });
console.log('status      ', JSON.stringify(await call(status, 'https://x/api/status')).slice(0, 220));
mem.clear(); j = await call(news, 'https://x/api/news'); await Promise.all(pend); console.log('bg refresh  ', j.refreshing, Object.keys((await call(news, 'https://x/api/news')).payload.countries));
