// node test/ai.test.mjs — pipeline with a fake Workers AI
import { runRefresh } from '../lib/pipeline.js';
const now = Date.now();
const items = [['Israeli strikes kill 30 in Gaza as ceasefire falters', 1], ['Russia launches 140 drones at Ukraine overnight; five killed', 2], ['FIFA rankings: France finish the year on the podium', 2], ['Why is Pete Hegseth strengthening US military ties with Venezuela?', 3], ['Global markets rally', 2]];
const rss = `<rss><channel>${items.map(([t, h]) => `<item><title>${t}</title><link>https://ex.com/${encodeURIComponent(t)}</link><pubDate>${new Date(now - h * 3600e3).toUTCString()}</pubDate></item>`).join('')}</channel></rss>`;
const fake = async () => new Response(rss);
let calls = 0;
const AI = { async run(model, { messages }) {
  calls++;
  const u = messages[1].content;
  if (messages[0].content.startsWith('You label')) {
    const map = { Israeli: 'Palestine|Israel|5|Conflict,Humanitarian', Russia: 'Ukraine|Russia|4|Conflict', FIFA: 'France|-|1|', Why: 'Venezuela|United States|2|Politics', Global: 'none|-|2|Economy' };
    return { response: u.split('\n').map((l, i) => `${i + 1}|${map[Object.keys(map).find(k => l.includes(k))]}`).join('\n') };
  }
  return { response: u.split('\n').filter(l => l.startsWith('## ')).map(l => `${l.slice(3)}|A short neutral summary of what happened in ${l.slice(3)} today.`).join('\n') };
} };
const r = await runRefresh(null, fake, now, { AI });
console.log(r.log.slice(-2), 'scoring', r.payload.scoring, 'AI calls', calls);
for (const [c, v] of Object.entries(r.payload.countries).sort((a, b) => b[1].score - a[1].score)) console.log(v.level.padEnd(6), String(v.score).padStart(3), c.padEnd(26), v.tags.join(','), '|', v.summary);
calls = 0; const r2 = await runRefresh(r.payload, fake, now + 60e3, { AI });
console.log('second run AI calls (should be 0):', calls, 'events', r2.payload.events.length, r.payload.events.length);
const r3 = await runRefresh(null, fake, now, { AI: { run: async () => { throw new Error('quota exceeded'); } } });
console.log('AI down ->', r3.payload.scoring, r3.log.slice(-1), Object.keys(r3.payload.countries));
