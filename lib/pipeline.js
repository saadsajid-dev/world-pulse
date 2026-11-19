// World Pulse news pipeline: newswire RSS feeds -> events -> per-country edition.
// Stage 2 uses keyword rules only (no AI), so it always works and costs nothing.
import { countriesIn } from './countries.js';

export const FEEDS = [
  { source: 'BBC News', url: 'https://feeds.bbci.co.uk/news/world/rss.xml' },
  { source: 'Al Jazeera', url: 'https://www.aljazeera.com/xml/rss/all.xml' },
  { source: 'The Guardian', url: 'https://www.theguardian.com/world/rss' },
  { source: 'NPR', url: 'https://feeds.npr.org/1004/rss.xml' },
  { source: 'DW', url: 'https://rss.dw.com/rdf/rss-en-world' },
  { source: 'France 24', url: 'https://www.france24.com/en/rss' },
  { source: 'UN News', url: 'https://news.un.org/feed/subscribe/en/news/all/rss.xml' },
  { source: 'ABC News (AU)', url: 'https://www.abc.net.au/news/feed/2942460/rss.xml' },
];

export const ENGINE = 'rules-v3';     // bump when scoring changes: the next visit rebuilds the edition
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

const TOPIC_RULES = [
  ['Conflict', /\b(war|strikes?|air ?strikes?|missiles?|troops|attacks?|drones?|military|army|kill(s|ed)?|ceasefire|truce|hostages?|shelling|rebels?|militants?|insurgen\w*|offensive|invasion|soldiers|bomb\w*|front ?line|armed)\b/i],
  ['Politics', /\b(elections?|president|prime minister|minister|parliament|votes?|protests?|court|talks|summit|diplomat\w*|sanctions?|government|opposition|coup|referendum|party|leader|treaty|embassy)\b/i],
  ['Economy', /\b(econom\w*|trade|tariffs?|markets?|oil|gas|energy|inflation|banks?|budget|stocks?|gdp|exports?|imports?|currency|debt|investment|jobs|prices|shipping|supply)\b/i],
  ['Climate', /\b(earthquake|cyclone|floods?|flooding|storm|hurricane|typhoon|wildfires?|heatwave|climate|drought|volcan\w*|landslide|tsunami|weather|emissions|cop\d+)\b/i],
  ['Health', /\b(ebola|cholera|measles|mpox|outbreak|virus|vaccin\w*|hospitals?|health|disease|epidemic|pandemic|malaria)\b/i],
  ['Humanitarian', /\b(famine|aid|refugees?|displaced|humanitarian|hunger|starvation|migrants?|asylum)\b/i],
];
export const topicsOf = text => TOPIC_RULES.filter(([, re]) => re.test(text)).map(([n]) => n);

/* ---------- build events from feed items ---------- */
function hashId(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); }

export function itemsToEvents(items) {
  const ev = [];
  for (const it of items) {
    const cs = countriesIn(it.title, it.desc);
    if (!cs.length) continue;
    const text = it.title + '. ' + it.desc;
    const sev = severityOf(it.title, text), tags = SOFT.test(it.title) ? [] : topicsOf(text);
    cs.slice(0, 2).forEach((c, i) => ev.push({
      id: hashId(it.url + '|' + c), country: c, t: new Date(it.t).toISOString(),
      headline: it.title, source: it.source, url: it.url,
      sev: i === 0 || sev >= 4 ? sev : Math.max(1, sev - 1), tags, also: cs.filter(x => x !== c).slice(0, 2),
    }));
  }
  return ev;
}

/* ---------- combine events into a per-country edition ---------- */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dayLabel = iso => { const d = new Date(iso); return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`; };
const trim = (s, n) => s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : s;

export function buildEdition(events, now = Date.now()) {
  const by = {};
  for (const e of events) (by[e.country] ||= []).push(e);
  const countries = {};
  for (const [c, list] of Object.entries(by)) {
    list.sort((a, b) => Date.parse(b.t) - Date.parse(a.t));
    let peak = 0;
    for (const e of list) {
      const ageH = (now - Date.parse(e.t)) / 3600e3;
      peak = Math.max(peak, e.sev * 15 * Math.max(.4, 1 - ageH / 72));
    }
    // only serious stories (severity 3+) in the last day add weight; feature and sport pieces don't
    const serious = list.filter(e => e.sev >= 3 && now - Date.parse(e.t) < 24 * 3600e3).length;
    const score = Math.round(Math.min(100, peak + Math.min(25, Math.max(0, serious - 1) * 5)));
    const level = score >= 70 ? 'red' : score >= 42 ? 'orange' : 'green';
    const tagCount = {};
    list.forEach(e => e.tags.forEach(t => tagCount[t] = (tagCount[t] || 0) + 1));
    const tags = Object.entries(tagCount).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([t]) => t);
    const top = [...list].sort((a, b) => b.sev - a.sev || Date.parse(b.t) - Date.parse(a.t));
    const seenH = new Set(), distinct = top.filter(e => { const k = e.headline.toLowerCase().slice(0, 50); if (seenH.has(k)) return false; seenH.add(k); return true; });
    countries[c] = {
      level, score, tags: tags.length ? tags : ['Politics'],
      headline: (() => { const day = list.filter(e => now - Date.parse(e.t) < 24 * 3600e3), pool = day.length ? day : list, top = Math.max(...pool.map(e => e.sev)); return pool.find(e => e.sev === top).headline; })(),   // newest of the most serious recent stories
      summary: distinct.slice(0, 2).map(e => e.headline.replace(/[.\s]*$/, '.')).join(' '),
      updates: distinct.slice(0, 3).sort((a, b) => Date.parse(b.t) - Date.parse(a.t)).map(e => ({ date: dayLabel(e.t), text: trim(e.headline, 90) })),
      sources: distinct.slice(0, 3).map(e => ({ title: `${e.source} — ${trim(e.headline, 60)}`, url: e.url })),
      lastEvent: list[0].t,
    };
  }
  // connecting lines: countries named together in the same story
  const pair = {};
  for (const e of events) for (const o of e.also || []) {
    if (!countries[o]) continue;
    const k = [e.country, o].sort().join('|');
    const p = pair[k] ||= { path: k.split('|'), n: 0, sev: 0, label: '', tags: {} };
    p.n++; if (e.sev >= p.sev) { p.sev = e.sev; p.label = trim(e.headline, 80); }
    e.tags.forEach(t => p.tags[t] = (p.tags[t] || 0) + 1);
  }
  const links = Object.values(pair).filter(p => p.n >= 2 || p.sev >= 4).sort((a, b) => b.n * b.sev - a.n * a.sev).slice(0, 12).map(p => {
    const t = Object.entries(p.tags).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Politics';
    const topic = { Conflict: 'conflict', Politics: 'politics', Economy: 'economy', Climate: 'climate', Health: 'health', Humanitarian: 'health' }[t] || 'politics';
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
export async function runRefresh(prev, fetchImpl = fetch, now = Date.now()) {
  const log = [];
  const results = await Promise.allSettled(FEEDS.map(async f => {
    const r = await fetchImpl(f.url, { headers: { 'user-agent': 'WorldPulse/1.0 (news map)' }, cf: { cacheTtl: 300 } });
    if (!r.ok) throw new Error(`${f.source}: HTTP ${r.status}`);
    return parseFeed(await r.text(), f.source);
  }));
  let items = [];
  results.forEach((r, i) => { if (r.status === 'fulfilled') { items.push(...r.value); log.push(`${FEEDS[i].source}: ${r.value.length}`); } else log.push(String(r.reason?.message || r.reason)); });
  const cutoff = now - EVENT_TTL_H * 3600e3;
  items = items.filter(it => it.t > cutoff && it.t < now + 3600e3);

  const fresh = itemsToEvents(items);
  let old = (prev?.events || []).filter(e => Date.parse(e.t) > cutoff && Number.isFinite(e.sev));
  if (prev?.engine !== ENGINE) old = old.map(e => ({ ...e, sev: severityOf(e.headline), tags: SOFT.test(e.headline) ? [] : topicsOf(e.headline) }));
  const seen = new Set(); const events = [];
  for (const e of [...fresh, ...old]) { if (seen.has(e.id)) continue; seen.add(e.id); events.push(e); }
  events.sort((a, b) => Date.parse(b.t) - Date.parse(a.t));
  events.length = Math.min(events.length, MAX_EVENTS);

  const { countries, links } = buildEdition(events, now);
  const payload = { updated: new Date(now).toISOString(), edition: editionLabel(now), events, countries, links, engine: ENGINE };
  return { payload, log, feedItems: items.length, newEvents: fresh.length };
}
