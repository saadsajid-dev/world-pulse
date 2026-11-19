// World Pulse news pipeline: newswire RSS feeds -> events -> per-country edition.
// Stage 2 uses keyword rules only (no AI), so it always works and costs nothing.
import { countriesIn } from './countries.js';
import { classify, summarise } from './ai.js';

export const FEEDS = [
  { source: 'BBC News', url: 'https://feeds.bbci.co.uk/news/world/rss.xml' },
  { source: 'Al Jazeera', url: 'https://www.aljazeera.com/xml/rss/all.xml' },
  { source: 'The Guardian', url: 'https://www.theguardian.com/world/rss' },
  { source: 'NPR', url: 'https://feeds.npr.org/1004/rss.xml' },
  { source: 'DW', url: 'https://rss.dw.com/rdf/rss-en-world' },
  { source: 'France 24', url: 'https://www.france24.com/en/rss' },
  { source: 'UN News', url: 'https://news.un.org/feed/subscribe/en/news/all/rss.xml' },
  { source: 'ABC News (AU)', url: 'https://www.abc.net.au/news/feed/10719986/rss.xml' },   // Top Stories (the old ID was the Grandstand sport feed)
];

export const ENGINE = 'v7';
export const LABEL_V = 2;   // version of the AI labelling rules: stories labelled under an older version get relabelled   // bump when scoring changes: the next visit rebuilds the edition
const AI_MAX_ITEMS = 90, AI_MAX_SUMMARIES = 18;   // per refresh: keeps each run to ~15 s; the rest is labelled on the next refresh     // bump when scoring changes: the next visit rebuilds the edition
export const EVENT_TTL_H = 72;        // keep events this long
const MAX_EVENTS = 700;

/* ---------- RSS parsing (regex: tiny and cheap on CPU) ---------- */
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'", hellip: '…', mdash: '—', ndash: '–', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”' };
function clean(s = '') {
  return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) => {
      if (e[0] === '#') { const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(n) ? String.fromCodePoint(n) : m; }
      return ENT[e.toLowerCase()] ?? m;
    })
    .replace(/\s+/g, ' ').trim();
}
const tag = (block, name) => { const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i')); return m ? clean(m[1]) : ''; };

export function parseFeed(xml, source) {
  const out = [];
  const items = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) || [];
  for (const it of items) {
    const title = tag(it, 'title');
    let link = tag(it, 'link') || (it.match(/rdf:about="([^"]+)"/) || [])[1] || '';
    const when = tag(it, 'pubDate') || tag(it, 'dc:date') || tag(it, 'updated');
    const desc = tag(it, 'description');
    const t = Date.parse(when);
    if (!title || !link || !Number.isFinite(t)) continue;
    out.push({ title, url: link.trim(), t, desc, source });
  }
  return out;
}

/* ---------- keyword rules: severity and topic ---------- */
const STRONG = /\b(kill(s|ed|ing)?|dead|deaths?|death toll|massacre|genocide|air ?strikes?|bombard\w*|shelling|missiles?|invasion|invades?|coup|earthquake|cyclone|hurricane|typhoon|tsunami|famine|ebola|cholera|epidemic|pandemic|explosions?|blasts?|war|offensive|ballistic|nuclear test)\b/i;
const MEDIUM = /\b(attacks?|strikes?|clash(es)?|drones?|troops|military|protests?|riots?|floods?|flooding|wildfires?|evacuat\w*|crisis|sanctions?|arrest(s|ed)?|ceasefire|truce|hostages?|refugees?|outbreak|shooting|emergency|collapse[ds]?|resign(s|ed|ation)?|impeach\w*|curfew|siege|insurgen\w*|militants?|rebels?|abduct\w*|kidnap\w*|landslide|heatwave|drought|volcan\w*|army|forces|fighting|battles?|front ?line|advances?|retreats?|raids?|gunmen|bandits)\b/i;
const LIGHT = /\b(elections?|votes?|talks|summit|deal|minister|president|prime minister|trade|tariffs?|court|parliament|budget|economy|inflation|treaty|visit|agreement|reform|policy)\b/i;
const BIG_NUM = /\b(\d{2,}|dozens|hundreds|thousands)\b[^.]{0,30}\b(killed|dead|die[ds]?|people|civilians|injured|wounded|displaced|evacuated)\b|\b(kill(s|ed)?|death toll (rises|climbs|reaches)( to)?)\s+(at least\s+)?(\d{2,}|dozens|hundreds|thousands)\b/i;

// sport, culture and lifestyle stories don't count towards a country's urgency
export const SOFT = /\b(fifa|football|soccer|cricket|rugby|tennis|golf|marathon|olympics?|world cup|premier league|champions league|grand prix|f1|nba|nfl|coach|striker|midfielder|goalkeeper|referee|match(es)?|tournament|springboks|wallabies|all blacks|film|movie|box office|album|singer|actor|actress|celebrity|festival|recipe|fashion|museum|exhibition|art(ist)?|novel|book review|awards?|best school|royal family|wedding|zoo|travel|holiday|restaurant)\b/i;
const ANALYSIS = /^(why|how|what|who|is|are|can|will|should|analysis|opinion|explainer|inside|the long read)\b|\?\s*$/i;

export function severityOf(title, text = title) {
  if (SOFT.test(title)) return 1;
  let s = STRONG.test(text) ? 4 : MEDIUM.test(text) ? 3 : LIGHT.test(text) ? 2 : 1;
  if (s >= 3 && BIG_NUM.test(text)) s = 5;
  if (ANALYSIS.test(title)) s = Math.max(1, s - 1);   // explainers and opinion pieces are context, not new events
  return s;
}

export const TOPIC_KEYS = ['conflict', 'politics', 'economy', 'climate', 'health', 'aid', 'justice'];
export const TOPIC_LABEL = { conflict: 'Conflict', politics: 'Politics', economy: 'Economy', climate: 'Climate', health: 'Health', aid: 'Humanitarian', justice: 'Justice' };
// each topic must be backed by words that actually belong to it (a guard against one-off AI mistakes)
const LEX = {
  conflict: /\b(war|wars|strikes?|air ?strikes?|missiles?|drones?|troops|army|armed|military|attack(s|ed)?|bomb\w*|shell(s|ing)?|kill(s|ed|ing)?|fighting|clash(es)?|militants?|rebels?|insurg\w*|terror\w*|ceasefire|truce|hostages?|navy|naval|warships?|soldiers?|offensive|invasion|weapons?|gunmen|front ?line|houthis?|hezbollah|hamas|idf|nato)\b/i,
  politics: /./,
  economy: /\b(econom\w*|markets?|trade|tariffs?|oil|gas|energy|prices?|inflation|banks?|budget|stocks?|shares|gdp|exports?|imports?|currency|debt|invest\w*|jobs|compan(y|ies)|business(es)?|shipping|industr\w*|tax(es)?|fuel|administration|retail\w*|profits?|loans?|growth|recession|interest rates?|fiscal|sanctions)\b/i,
  climate: /\b(climate|weather|storms?|cyclones?|hurricanes?|typhoons?|floods?|flooding|rain\w*|droughts?|heat\w*|wildfires?|bushfires?|fires?|earthquakes?|quakes?|tsunami|volcan\w*|landslides?|emissions|cop\d*|snow\w*|tornado\w*|disasters?|atmospheric river|monsoon|el ni[nñ]o)\b/i,
  health: /\b(health|disease|outbreaks?|epidemic|pandemic|virus|viral|vaccin\w*|hospitals?|patients?|doctors?|nurses?|medic\w*|cholera|ebola|measles|mpox|malaria|dengue|polio|cancer|infections?|who|clinics?|mortality|drugs?)\b/i,
  aid: /\b(aid|humanitarian|refugees?|displac\w*|famine|hunger|starv\w*|evacu\w*|relief|unhcr|wfp|unicef|unrwa|asylum|migrants?|shelters?|food insecurity|food shortages?|flee(s|ing)?|fled|camps?)\b/i,
  justice: /\b(courts?|trials?|judges?|rul(ing|es|ed)|verdicts?|sentenc\w*|convict\w*|charged|charges|accused|prosecut\w*|police|arrest\w*|crimes?|criminal|murder\w*|theft|stolen|steal\w*|fraud|corruption|lawsuit|sued|rights|censorship|icj|icc|inquest|prison|jail\w*|genocide|tribunal|indict\w*|bail|smuggl\w*)\b/i,
};
const RESCUE_ORDER = ['conflict', 'climate', 'health', 'aid', 'justice', 'economy'];
const lexOK = (k, text) => !!LEX[k]?.test(text);
/** Final topics for a story: one main topic (checked against its words), plus a second only for serious stories. */
export function assignTopics(main, second, sev, text) {
  if (sev <= 1 || main === 'other' || (!main && SOFT.test(text))) return [];
  let m = main && TOPIC_KEYS.includes(main) && lexOK(main, text) ? main : (RESCUE_ORDER.find(k => lexOK(k, text)) || 'politics');
  const out = [{ k: m, sev }];
  if (second && second !== m && TOPIC_KEYS.includes(second) && sev >= 3 && lexOK(second, text)) out.push({ k: second, sev: sev - 1 });
  return out;
}
/** keyword-only guess of the main topic (used when the AI is unavailable) */
const POLITICS_WORDS = /\b(elections?|vot(e|es|ing)|president|prime minister|minister|government|parliament|senate|congress|party|opposition|diplomat\w*|summit|talks|treaty|protests?|referendum|cabinet|policy|sanctions)\b/i;
export const rulesTopic = text => RESCUE_ORDER.find(k => lexOK(k, text)) || (POLITICS_WORDS.test(text) ? 'politics' : 'other');

/* ---------- build events from feed items ---------- */
function hashId(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); }

export function itemsToEvents(items, ai = {}) {
  const ev = [];
  for (const it of items) {
    const a = ai[it.url];
    let cs, sev, topics;
    const text = it.title + '. ' + (it.desc || '');
    if (a) {   // AI label: where it happened, who else is involved, how serious, what it's about
      if (!a.country) continue;
      cs = [...new Set([a.country, a.other].filter(Boolean))];
      sev = a.sev; topics = assignTopics(a.main, a.second, sev, text);
    } else {   // keyword rules fallback
      cs = countriesIn(it.title, it.desc);
      if (!cs.length) continue;
      sev = severityOf(it.title, text); topics = assignTopics(SOFT.test(it.title) ? 'other' : rulesTopic(text), null, sev, text);
    }
    cs.slice(0, 2).forEach((c, i) => ev.push({
      id: hashId(it.url + '|' + c), country: c, t: new Date(it.t).toISOString(),
      headline: it.title, source: it.source, url: it.url,
      sev: i === 0 || sev >= 4 ? sev : Math.max(1, sev - 1), topics, tags: topics.map(x => TOPIC_LABEL[x.k]), also: cs.filter(x => x !== c).slice(0, 2), ...(a ? { ai: LABEL_V } : {}),
    }));
  }
  return ev;
}

/* ---------- combine events into a per-country edition ---------- */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dayLabel = iso => { const d = new Date(iso); return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`; };
const trim = (s, n) => s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : s;

const levelFor = score => score >= 70 ? 'red' : score >= 42 ? 'orange' : 'green';

const wordSet = s => new Set(String(s).toLowerCase().match(/[a-z0-9']{4,}/g) || []);
function sameStory(a, b) { const A = wordSet(a), B = wordSet(b); if (!A.size || !B.size) return false; let k = 0; A.forEach(x => B.has(x) && k++); return k / Math.min(A.size, B.size) >= .5; }
/** group repeat coverage of one story (several outlets) — newest first in, so the first of a group is its newest report */
function clusterize(list) {
  const heads = [];
  for (const e of list) { const h = heads.find(x => Math.abs(Date.parse(x.t) - Date.parse(e.t)) < 48 * 3600e3 && sameStory(x.headline, e.headline)); if (h) { e._c = h._c; h._n = (h._n || 1) + 1; h.sev = Math.max(h.sev, e.sev); } else { e._c = heads.length; heads.push(e); } }
  return heads;   // one event per story
}
/** Score one list of events (newest first): urgency 0-100, the headline to show, briefing lines. */
function scoreList(all, now) {
  const list = clusterize(all.map(e => ({ ...e })));   // one entry per story: repeat coverage doesn't inflate or repeat
  let peak = 0;
  for (const e of list) peak = Math.max(peak, e.sev * 15 * Math.max(.4, 1 - (now - Date.parse(e.t)) / 3600e3 / 72));
  // only serious stories (severity 3+) in the last day add weight; feature and sport pieces don't
  const serious = list.filter(e => e.sev >= 3 && now - Date.parse(e.t) < 24 * 3600e3).length;   // distinct serious stories
  const score = Math.round(Math.min(100, peak + Math.min(25, Math.max(0, serious - 1) * 5)));
  const day = list.filter(e => now - Date.parse(e.t) < 24 * 3600e3), pool = day.length ? day : list, topSev = Math.max(...pool.map(e => e.sev));
  const top = [...list].sort((a, b) => b.sev - a.sev || Date.parse(b.t) - Date.parse(a.t));
  const seenH = new Set(), distinct = top.filter(e => { const k = e.headline.toLowerCase().slice(0, 50); if (seenH.has(k)) return false; seenH.add(k); return true; });
  return {
    score,
    headline: pool.find(e => e.sev === topSev).headline,   // newest of the most serious recent stories
    summary: distinct.filter(e => !sameStory(e.headline, pool.find(x => x.sev === topSev).headline)).slice(0, 2).map(e => e.headline.replace(/[.\s]*$/, '.')).join(' '),   // other stories, never the headline again
    updates: distinct.slice(0, 3).sort((a, b) => Date.parse(b.t) - Date.parse(a.t)).map(e => ({ date: dayLabel(e.t), text: trim(e.headline, 90) })),
    sources: distinct.slice(0, 3).map(e => ({ title: `${e.source} — ${trim(e.headline, 60)}`, url: e.url })),
    lastEvent: list[0].t,
  };
}

/* ongoing-crisis memory: worst severity per country per day (overall and per topic), kept 14 days */
const dayKey = ms => new Date(ms).toISOString().slice(0, 10);
export function updateMemory(mem = {}, events, now = Date.now()) {
  const out = {}, keep = dayKey(now - 14 * 864e5);
  for (const [c, days] of Object.entries(mem)) for (const [d, v] of Object.entries(days)) if (d >= keep) (out[c] ||= {})[d] = { ...v };
  for (const e of events) {
    const d = dayKey(Date.parse(e.t)); if (d < keep) continue;
    const slot = ((out[e.country] ||= {})[d] ||= {});
    slot.all = Math.max(slot.all || 0, e.sev);
    for (const x of e.topics || []) slot[x.k] = Math.max(slot[x.k] || 0, x.sev);
  }
  return out;
}
/** A war doesn't stop because today was quiet: serious events on 3+ of the last 10 days keep a country Critical,
    one in the last 5 days keeps it at least Emerging. */
export function floorFor(days = {}, key = 'all', now = Date.now()) {
  let in10 = 0, in5 = false;
  for (const [d, v] of Object.entries(days)) {
    const age = (now - Date.parse(d + 'T12:00:00Z')) / 864e5;
    if ((v[key] || 0) < 4) continue;
    if (age <= 10) in10++;
    if (age <= 5) in5 = true;
  }
  return in10 >= 3 ? 72 : in5 ? 50 : 0;
}

export function buildEdition(events, now = Date.now(), memory = null, prevCountries = {}) {
  const by = {};
  for (const e of events) (by[e.country] ||= []).push(e);
  const countries = {};
  for (const [c, list] of Object.entries(by)) {
    list.sort((a, b) => Date.parse(b.t) - Date.parse(a.t));
    const s = scoreList(list, now);
    const fl = memory ? floorFor(memory[c], 'all', now) : 0;
    if (fl > s.score) { s.score = fl; s.ongoing = 1; }
    const tagCount = {};
    list.forEach(e => (e.tags || []).forEach(tg => tagCount[tg] = (tagCount[tg] || 0) + 1));
    const tags = Object.entries(tagCount).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([tg]) => tg);
    // the same scoring, per topic: how serious is this country's conflict / politics / economy … news on its own
    const byTopic = {};
    for (const k of TOPIC_KEYS) {
      const tl = list.filter(e => (e.topics || []).some(x => x.k === k)).map(e => ({ ...e, sev: e.topics.find(x => x.k === k).sev }));
      if (!tl.length) { const tf = memory ? floorFor(memory[c], k, now) : 0; if (tf) byTopic[k] = { level: levelFor(tf), ...s, score: tf, ongoing: 1 }; continue; }   // ongoing crisis in this topic, quiet today
      const ts = scoreList(tl, now), tf = memory ? floorFor(memory[c], k, now) : 0;
      if (tf > ts.score) { ts.score = tf; ts.ongoing = 1; }
      byTopic[k] = { level: levelFor(ts.score), ...ts };
    }
    countries[c] = { level: levelFor(s.score), ...s, tags, byTopic };
  }
  // ongoing crises with no fresh headline today: keep the last edition's entry at the crisis floor
  if (memory) for (const [c, days] of Object.entries(memory)) {
    if (countries[c] || !prevCountries[c]) continue;
    const fl = floorFor(days, 'all', now); if (!fl) continue;
    const p = prevCountries[c];
    countries[c] = { ...p, score: Math.max(fl, Math.min(p.score || 0, fl + 10)), level: levelFor(fl), ongoing: 1 };
  }
  // connecting lines: countries named together in the same story
  const pair = {};
  for (const e of events) for (const o of e.also || []) {
    if (!countries[o]) continue;
    const k = [e.country, o].sort().join('|');
    const p = pair[k] ||= { path: k.split('|'), n: 0, sev: 0, label: '', tags: {} };
    p.n++; if (e.sev >= p.sev) { p.sev = e.sev; p.label = trim(e.headline, 80); }
    (e.topics || []).forEach(x => p.tags[x.k] = (p.tags[x.k] || 0) + 1);
  }
  const links = Object.values(pair).filter(p => p.n >= 2 || p.sev >= 4).sort((a, b) => b.n * b.sev - a.n * a.sev).slice(0, 12).map(p => {
    const t = Object.entries(p.tags).sort((a, b) => b[1] - a[1])[0]?.[0] || 'politics';
    const topic = TOPIC_KEYS.includes(t) ? t : 'politics';
    return { path: p.path, label: p.label, topic, weight: p.n >= 4 ? 3 : p.n >= 2 ? 2 : 1 };
  });
  return { countries, links };
}

export function editionLabel(now = Date.now()) {
  try {
    const f = new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Adelaide', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true, timeZoneName: 'short' });
    const p = Object.fromEntries(f.formatToParts(new Date(now)).map(x => [x.type, x.value]));
    return `${p.weekday} ${p.day} ${p.month} ${p.year} · ${p.hour}:${p.minute} ${String(p.dayPeriod || '').toLowerCase()} ${p.timeZoneName || ''}`.trim();
  } catch { return new Date(now).toUTCString(); }
}

/* ---------- full refresh ---------- */
export async function runRefresh(prev, fetchImpl = fetch, now = Date.now(), env = null, progress = async () => {}) {
  const log = [], T0 = Date.now(), mark = s => progress(`${s} @${Date.now() - T0}ms`);
  const results = await Promise.allSettled(FEEDS.map(async f => {
    const r = await fetchImpl(f.url, { headers: { 'user-agent': 'WorldPulse/1.0 (news map)' }, cf: { cacheTtl: 300 } });
    if (!r.ok) throw new Error(`${f.source}: HTTP ${r.status}`);
    return parseFeed(await r.text(), f.source);
  }));
  let items = [];
  results.forEach((r, i) => { if (r.status === 'fulfilled') { items.push(...r.value); log.push(`${FEEDS[i].source}: ${r.value.length}`); } else log.push(String(r.reason?.message || r.reason)); });
  const cutoff = now - EVENT_TTL_H * 3600e3;
  { const byUrl = new Map(); for (const it of items) if (it.t > cutoff && it.t < now + 3600e3 && !byUrl.has(it.url)) byUrl.set(it.url, it); items = [...byUrl.values()]; }

  await mark(`feeds ok (${items.length})`);
  // AI labels: only for stories not labelled before (saves the free daily allowance)
  let old = (prev?.events || []).filter(e => Date.parse(e.t) > cutoff && Number.isFinite(e.sev));
  const skip = (prev?.aiSkip || []).filter(s => s.t > cutoff);
  { const have = new Set(items.map(it => it.url));   // stored stories labelled under older rules get relabelled too
    for (const e of prev?.events || []) if (e.ai !== LABEL_V && Date.parse(e.t) > cutoff && !have.has(e.url)) { have.add(e.url); items.push({ title: e.headline, url: e.url, t: Date.parse(e.t), desc: '', source: e.source }); } }   // stories the AI said aren't about a country
  const aiDone = new Set([...old.filter(e => e.ai === LABEL_V).map(e => e.url), ...skip.filter(s => s.v === LABEL_V).map(s => s.url)]);
  const todo = items.filter(it => !aiDone.has(it.url)).sort((a, b) => b.t - a.t).slice(0, AI_MAX_ITEMS);
  const ai = {}; let scoring = 'rules', models = [];
  if (env?.AI && todo.length) {
    try {
      await mark(`AI labelling ${todo.length}`);
      const r = await classify(env, todo);
      r.results.forEach((x, i) => { if (x) { ai[todo[i].url] = x; if (!x.country) skip.push({ url: todo[i].url, t: todo[i].t, v: LABEL_V }); } });
      models = r.models; scoring = 'ai';
      log.push(`AI labelled ${Object.keys(ai).length}/${todo.length} new stories (${models.join(', ')})`);
    } catch (e) { log.push('AI unavailable, using keyword rules: ' + String(e.message || e).slice(0, 120)); }
  } else if (env?.AI) scoring = 'ai';
  // stories not (re)labelled yet under the current rules: keyword topics until the AI gets to them
  old = old.map(e => e.ai === LABEL_V ? e : (() => { const sev = e.ai ? e.sev : severityOf(e.headline), topics = assignTopics(SOFT.test(e.headline) ? 'other' : rulesTopic(e.headline), null, sev, e.headline); return { ...e, sev, topics, tags: topics.map(x => TOPIC_LABEL[x.k]) }; })());
  old = old.filter(e => !ai[e.url]);   // a freshly AI-labelled story replaces its old keyword version

  const fresh = itemsToEvents(items.filter(it => !aiDone.has(it.url)), ai);
  const seen = new Set(); const events = [];
  for (const e of [...fresh, ...old]) { if (seen.has(e.id)) continue; seen.add(e.id); events.push(e); }
  events.sort((a, b) => Date.parse(b.t) - Date.parse(a.t));
  events.length = Math.min(events.length, MAX_EVENTS);

  const memory = updateMemory(prev?.memory, events, now);
  const { countries, links } = buildEdition(events, now, memory, prev?.countries || {});

  // AI briefings for the countries that matter most; reuse a briefing while its headlines haven't changed
  if (env?.AI) {
    const want = Object.entries(countries).filter(([, v]) => v.level !== 'green' || v.score >= 30).sort((a, b) => b[1].score - a[1].score);
    const groups = [];
    for (const [c, v] of want) {
      const hs = events.filter(e => e.country === c && e.sev >= 2).slice(0, 6).map(e => e.headline);
      if (!hs.length) continue;
      const key = hashId(hs.join("|")), po = prev?.countries?.[c];
      if (po?.sumKey === key && po.aiSum) { v.summary = po.summary; v.sumKey = key; v.aiSum = 1; continue; }
      if (groups.length < AI_MAX_SUMMARIES) groups.push({ country: c, headlines: hs, key });
    }
    if (groups.length) {
      try {
        await mark(`AI briefings ${groups.length}`);
        const sums = await summarise(env, groups);
        for (const g of groups) if (sums[g.country]) Object.assign(countries[g.country], { summary: sums[g.country], sumKey: g.key, aiSum: 1 });
        log.push(`AI briefings: ${Object.keys(sums).length}/${groups.length}`);
      } catch (e) { log.push('AI briefings skipped: ' + String(e.message || e).slice(0, 120)); }
    }
  }
  const payload = { updated: new Date(now).toISOString(), edition: editionLabel(now), events, countries, links, memory, engine: ENGINE, scoring, aiSkip: skip.slice(-600), pending: env?.AI && scoring === 'ai' ? Math.max(0, items.filter(it => !aiDone.has(it.url)).length - todo.length) : 0 };
  return { payload, log, feedItems: items.length, newEvents: fresh.length };
}
