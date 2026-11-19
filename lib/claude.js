// Claude API (Anthropic). Used when the Worker has an ANTHROPIC_API_KEY secret; billed to that account.
export const LABEL_MODEL = 'claude-haiku-5-5';    // labelling and short summaries: quick and very cheap
export const BRIEF_MODEL = 'claude-sonnet-5-5';   // on-tap country briefings: better writing

export const hasClaude = env => !!env?.ANTHROPIC_API_KEY;

export async function claude(env, { model = LABEL_MODEL, system, user, maxTokens = 1024, timeoutMs = 25000 }) {
  const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', signal: ctl.signal,
      headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model, max_tokens: maxTokens, temperature: 0, system, messages: [{ role: 'user', content: user }] }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`Claude ${r.status}: ${j?.error?.message || 'request failed'}`);
    const text = (j.content || []).filter(c => c.type === 'text').map(c => c.text).join('');
    if (!text) throw new Error('Claude returned nothing');
    return { text, model, usage: j.usage };
  } finally { clearTimeout(timer); }
}
