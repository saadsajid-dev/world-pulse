// On-tap country briefings: written once per country + filter + set of stories, then cached for everyone.
import { claude, hasClaude, BRIEF_MODEL } from './claude.js';
import { kv, getLatest } from './store.js';
import { TOPIC_KEYS } from './pipeline.js';

const DAILY_CAP = 250;   // safety limit on new briefings per day (cached ones are free)
const NAMES = { all: 'news', conflict: 'conflict news', politics: 'political news', economy: 'economic news', climate: 'climate and disaster news', health: 'health news', aid: 'humanitarian and aid news', justice: 'justice and rights news' };
const SYSTEM = `You write short, calm, neutral country briefings for a world news map.
Use ONLY the reports given. Write 2-3 short sentences, at most 60 words. No speculation, no opinions, no headings, no bullet points.
Lead with the most important development. If the reports are about different, unrelated stories, cover the most important one first and give any other story its own separate sentence — never merge unrelated events into one sentence or imply they are connected.`;

function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); }
const words = s => new Set(String(s).toLowerCase().match(/[a-z0-9']{4,}/g) || []);
const same = (a, b) => { const A = words(a), B = words(b); if (!A.size || !B.size) return false; let k = 0; A.forEach(x => B.has(x) && k++); return k / Math.min(A.size, B.size) >= .5; };

export async function getBrief(env, country, topic = 'all') {
  if (topic !== 'all' && !TOPIC_KEYS.includes(topic)) return { ok: false, error: 'unknown filter' };
  const latest = await getLatest(env);
  if (!latest?.countries?.[country]) return { ok: false, error: 'no news for this country' };
  const stories = [];
  for (const e of latest.events || []) {
    if (e.country !== country || e.sev < 2) continue;
    if (topic !== 'all' && !(e.topics || []).some(x => x.k === topic)) continue;
    if (stories.some(s => same(s.headline, e.headline))) continue;   // one entry per story
    stories.push(e); if (stories.length >= 8) break;
  }
  if (!stories.length) return { ok: true, text: '', stories: 0 };
  const key = `brief:${country}:${topic}:${hash(stories.map(s => s.url).join('|'))}`;
  const cached = await kv(env).get(key, 'json');
  if (cached) return { ok: true, ...cached, cached: true };

  const day = new Date().toISOString().slice(0, 10), ck = `briefcount:${day}`;
  const used = +(await kv(env).get(ck)) || 0;
  if (used >= DAILY_CAP) return { ok: false, error: 'daily briefing limit reached' };
  await kv(env).put(ck, String(used + 1), { expirationTtl: 2 * 86400 });

  const user = `Country: ${country}\nWrite a brief of its ${NAMES[topic]}.\nReports (newest first):\n` +
    stories.map(s => `- [${s.t.slice(0, 16).replace('T', ' ')} UTC, ${s.source}] ${s.headline}`).join('\n');
  let text = '', model = '';
  if (hasClaude(env)) {
    try { const r = await claude(env, { model: BRIEF_MODEL, system: SYSTEM, user, maxTokens: 220 }); text = r.text; model = r.model; } catch (e) { /* fall back below */ }
  }
  if (!text && env.AI) {
    try { const r = await env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', { messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: user }], max_tokens: 220, temperature: 0.1 }); text = r?.response || ''; model = 'llama-3.3-70b'; } catch {}
  }
  text = String(text).replace(/\s+/g, ' ').trim();
  if (!text) return { ok: false, error: 'briefing unavailable right now' };
  const out = { text, model, stories: stories.length };
  await kv(env).put(key, JSON.stringify(out), { expirationTtl: 3 * 86400 });
  return { ok: true, ...out };
}
