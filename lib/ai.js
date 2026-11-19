// Free AI layer (Cloudflare Workers AI). Classifies headlines and writes short country summaries.
// Everything here is optional: if AI is unavailable or over its daily allowance, the keyword rules take over.
import { PLACES, countriesIn } from './countries.js';

export const MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';   // good judgement, quick, no long 'thinking' output
export const FALLBACK_MODEL = '@cf/meta/llama-3.1-8b-instruct-fp8';
const BATCH = 15, CALL_TIMEOUT_MS = 22000;
const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('AI timed out')), ms))]);

const NAMES = new Set(Object.keys(PLACES));
export function toMapName(name) {
  if (!name) return null;
  const n = String(name).trim().replace(/^the\s+/i, '');
  if (!n || /^(none|n\/a|global|world|unknown|-)$/i.test(n)) return null;
  if (NAMES.has(n)) return n;
  return countriesIn(n)[0] || null;
}

async function run(env, messages, maxTokens) {
  let lastErr;
  for (const model of [MODEL, FALLBACK_MODEL]) {
    try {
      const r = await withTimeout(env.AI.run(model, { messages, max_tokens: maxTokens, temperature: 0.1 }), CALL_TIMEOUT_MS);
      const text = typeof r === 'string' ? r : r?.response ?? r?.choices?.[0]?.message?.content ?? '';
      if (text) return { text: String(text), model };
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error('AI returned nothing');
}

const CLASSIFY_SYSTEM = `You label world-news headlines for a news map. For each numbered headline output exactly one line:
<number>|<country>|<other country or ->|<severity 1-5>|<topics>

country = the country where the event happens or that it is mainly about (common English name, e.g. "United States", "Palestine" for Gaza/West Bank, "DR Congo"). Use "none" if it is not about a specific country.
other country = a second country directly involved, else "-". For attacks, strikes, seizures or shipping incidents, put the country responsible here (e.g. Iran for attacks on ships in the Strait of Hormuz, Russia for strikes on Ukraine).
severity:
5 = mass-casualty violence (10+ dead), major war escalation, deadly major disaster, coup
4 = deadly attacks or strikes, active fighting, serious disaster or outbreak, violent unrest
3 = security or political crisis, big protests, sanctions, leaders arrested, major economic shock
2 = routine politics, diplomacy, elections, economy, court cases
1 = sport, culture, lifestyle, human interest, opinion or explainer pieces
topics = 1-3 of: Conflict, Politics, Economy, Climate, Health, Humanitarian (comma separated)
Output only the lines, nothing else.`;

/** items: [{title, desc}] -> [{country, other, sev, tags}|null] aligned with items */
export async function classify(env, items) {
  const out = new Array(items.length).fill(null);
  const batches = [];
  for (let i = 0; i < items.length; i += BATCH) batches.push(items.slice(i, i + BATCH).map((it, j) => [i + j, it]));
  const models = new Set();
  await Promise.all(batches.map(async b => {
    const user = b.map(([i, it], j) => `${j + 1}. ${it.title}${it.desc ? ' — ' + it.desc.slice(0, 140) : ''}`).join('\n');
    const { text, model } = await run(env, [{ role: 'system', content: CLASSIFY_SYSTEM }, { role: 'user', content: user }], 30 + b.length * 18);
    models.add(model);
    for (const line of text.split('\n')) {
      const m = line.trim().replace(/^[-*\s]+/, '').match(/^(\d+)\s*[|.)]\s*(.*)$/);
      if (!m) continue;
      const j = +m[1] - 1, parts = m[2].split('|').map(s => s.trim());
      if (!b[j] || parts.length < 3) continue;
      const sev = Math.max(1, Math.min(5, parseInt(parts[2], 10) || 0));
      if (!sev) continue;
      const tags = (parts[3] || '').split(/[,;/]/).map(s => s.trim()).filter(s => /^(Conflict|Politics|Economy|Climate|Health|Humanitarian)$/i.test(s)).map(s => s[0].toUpperCase() + s.slice(1).toLowerCase());
      out[b[j][0]] = { country: toMapName(parts[0]), other: toMapName(parts[1]), sev, tags };
    }
  }));
  return { results: out, models: [...models] };
}

const SUMMARY_SYSTEM = `You write two-sentence country briefings for a calm, neutral news map.
For each country block, output one line: <country>|<summary>
The summary is at most 2 short sentences (max 45 words), plain and factual, based only on the given headlines, newest first. No speculation, no opinions.
Output only the lines.`;

/** groups: [{country, headlines:[...]}] -> {country: summary} */
export async function summarise(env, groups) {
  if (!groups.length) return {};
  const chunks = []; for (let i = 0; i < groups.length; i += 6) chunks.push(groups.slice(i, i + 6));   // parallel calls keep the refresh quick
  const parts = await Promise.allSettled(chunks.map(c => summariseChunk(env, c)));
  const ok = parts.filter(p => p.status === 'fulfilled');
  if (!ok.length) throw parts[0].reason;
  return Object.assign({}, ...ok.map(p => p.value));
}
async function summariseChunk(env, groups) {
  const user = groups.map(g => `## ${g.country}\n` + g.headlines.slice(0, 6).map(h => '- ' + h).join('\n')).join('\n\n');
  const { text } = await run(env, [{ role: 'system', content: SUMMARY_SYSTEM }, { role: 'user', content: user }], 60 + groups.length * 75);
  const res = {};
  for (const line of text.split('\n')) {
    const i = line.indexOf('|'); if (i < 1) continue;
    const name = toMapName(line.slice(0, i).replace(/^[#\s*-]+/, '')), s = line.slice(i + 1).trim();
    if (name && s.length > 20) res[name] = s.replace(/\s+/g, ' ').slice(0, 320);
  }
  return res;
}
