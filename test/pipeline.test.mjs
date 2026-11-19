// node test/pipeline.test.mjs  — offline check of the pipeline with fake feeds
import { runRefresh, FEEDS } from '../lib/pipeline.js';
const now = Date.now(), iso = h => new Date(now - h * 3600e3).toUTCString();
const rss = items => `<?xml version="1.0"?><rss><channel>${items.map(([t, h, d]) => `<item><title><![CDATA[${t}]]></title><link>https://ex.com/${encodeURIComponent(t)}</link><pubDate>${iso(h)}</pubDate><description>${d || ''}</description></item>`).join('')}</channel></rss>`;
const rdf = items => `<rdf:RDF>${items.map(([t, h]) => `<item rdf:about="https://dw.com/${encodeURIComponent(t)}"><title>${t}</title><dc:date>${new Date(now - h * 3600e3).toISOString()}</dc:date></item>`).join('')}</rdf:RDF>`;
const A = [
  ['Israeli strikes kill 30 in Gaza as ceasefire falters', 1],
  ['Houthis fire missiles at Riyadh, coalition says', 2],
  ['Russia launches 140 drones at Ukraine overnight; five killed', 3],
  ['Cyclone Akvan nears India&#039;s east coast, 50,000 evacuated', 4],
  ['Trump meets Putin in Shenzhen ahead of trilateral with Xi', 5],
  ['Ebola outbreak spreads in DR Congo and Kenya', 6],
  ['Senegal ruling party expels President Faye', 20],
  ['Floods in New South Wales cut off towns', 7],
  ['Old story', 100],
];
const B = [['Sudan army advances in Kordofan as RSF retreats', 2], ['Germany and Ukraine to co-produce ground drones', 9]];
const fake = async url => {
  if (url.includes('dw.com')) return new Response(rdf(B));
  if (url.includes('npr')) return new Response('nope', { status: 500 });
  return new Response(rss(A));
};
const { payload, log, feedItems, newEvents } = await runRefresh(null, fake, now);
console.log(log.join(' | '));
console.log('items', feedItems, 'events', newEvents, 'countries', Object.keys(payload.countries).length, 'edition', payload.edition);
for (const [c, v] of Object.entries(payload.countries).sort((a, b) => b[1].score - a[1].score)) console.log(v.level.padEnd(6), String(v.score).padStart(3), c.padEnd(26), v.tags.join(','), '|', v.headline);
console.log('links', payload.links.map(l => l.path.join('-') + ':' + l.topic));
// second run keeps old events, no duplicates
const r2 = await runRefresh(payload, fake, now + 60e3);
console.log('rerun events', r2.payload.events.length, '(first', payload.events.length + ')');
if (r2.payload.events.length !== payload.events.length) throw new Error('duplicate events');
