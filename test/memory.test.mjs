// node test/memory.test.mjs — ongoing-crisis floor and per-topic levels
import { buildEdition, updateMemory, floorFor } from '../lib/pipeline.js';
const now = Date.parse('2026-11-19T12:00:00Z'), d = n => new Date(now - n * 864e5).toISOString();
const ev = (c, sev, ageDays, tags = ['Conflict'], h = 'x') => ({ id: c + sev + ageDays + h, country: c, t: d(ageDays), headline: h + ' ' + c + ageDays, source: 'T', url: 'u' + c + ageDays + h, sev, tags });
// Iran: serious conflict events 2, 4 and 6 days ago -> memory; today only a minor politics story
let mem = updateMemory({}, [ev('Iran', 4, 6), ev('Iran', 5, 4), ev('Iran', 4, 2)], now);
console.log('floor Iran', floorFor(mem.Iran, 'all', now), 'conflict', floorFor(mem.Iran, 'conflict', now), 'politics', floorFor(mem.Iran, 'politics', now));
const today = [ev('Iran', 2, 0.1, ['Politics'], 'Talks'), ev('Japan', 4, 0.1, ['Climate'], 'Quake'), ev('Japan', 2, 0.2, ['Politics'], 'Vote')];
mem = updateMemory(mem, today, now);
const { countries } = buildEdition(today, now, mem, { Iraq: { level: 'red', score: 80, headline: 'old' } });
for (const [c, v] of Object.entries(countries)) console.log(c.padEnd(6), v.level, v.score, v.ongoing ? '(ongoing)' : '', Object.entries(v.byTopic || {}).map(([k, x]) => `${k}:${x.level}/${x.score}`).join(' '));
if (countries.Iran.level !== 'red' || countries.Iran.byTopic.politics.level !== 'green' || countries.Japan.byTopic.politics.level !== 'green') throw new Error('unexpected');
console.log('ok');
