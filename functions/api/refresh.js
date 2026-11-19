// POST /api/refresh -> rebuild the shared edition from the newswires (one at a time, rate limited).
import { refreshEdition } from '../../lib/store.js';
import { json } from '../../lib/store.js';

export async function onRequestPost({ env, request, waitUntil }) {
  try {
    const manual = new URL(request.url).searchParams.get('manual') === '1';
    const job = refreshEdition(env, { manual });
    waitUntil?.(job.catch(() => {}));   // keep going for a while even if the visitor closes the page
    return json(await job);
  } catch (e) {
    return json({ ok: false, error: String(e.message || e) }, 500);
  }
}

// GET works too (same rate limits), so a refresh can be started from a browser address bar
export const onRequestGet = onRequestPost;
