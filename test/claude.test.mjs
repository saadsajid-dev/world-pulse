// node test/claude.test.mjs — Claude path with a fake Anthropic API
import { runRefresh } from '../lib/pipeline.js';
const now = Date.now(); let req;
const items = [['Home of Bangladesh former leader set on fire', 1], ['Dozens more children killed in Yemen amid escalating hostilities', 2]];
const rss = `<rss><channel>${items.map(([t, h]) => `<item><title>${t}</title><link>https://ex.com/${encodeURIComponent(t)}</link><pubDate>${new Date(now - h * 3600e3).toUTCString()}</pubDate></item>`).join('')}</channel></rss>`;
globalThis.fetch = async (url, opt) => {
  if (String(url).includes('anthropic')) { req = JSON.parse(opt.body); const u = req.messages[0].content;
    const text = req.system.startsWith('You label') ? u.split('\n').map((l, i) => `${i + 1}|${l.includes('Bangladesh') ? 'Bangladesh|-|3|Justice|-' : 'Yemen|Saudi Arabia|5|Conflict|-'}`).join('\n')
      : u.split('\n').filter(l => l.startsWith('## ')).map(l => `${l.slice(3)}|Summary for ${l.slice(3)}.`).join('\n');
    return new Response(JSON.stringify({ content: [{ type: 'text', text }], usage: {} }), { status: 200 }); }
  return new Response(rss);
};
const r = await runRefresh(null, fetch, now, { ANTHROPIC_API_KEY: 'test', AI: { run: async () => { throw new Error('should not be used'); } } });
console.log(r.log.slice(-2), 'model', req.model);
for (const e of r.payload.events) console.log(e.country, e.sev, JSON.stringify(e.topics), 'ai', e.ai);
