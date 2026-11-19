# World Pulse

An interactive 3D globe and flat map of world news. Each country is coloured by how urgent its news is: critical, emerging, minor or no news.

## Project layout

| Path | What it is |
|---|---|
| `site/index.html` | The built website, a single self-contained file. This is what gets deployed. |
| `src/template.html` | The app source (HTML, CSS and JavaScript). Edit this file, then rebuild. |
| `data/` | The map geometry, country lists and the bundled news snapshot (`news.json`). |
| `build.py` | Combines `src/` and `data/` into `site/index.html`. |
| `functions/api/` | Cloudflare Pages Functions: `news` (read the shared edition), `refresh` (rebuild it), `status` (diagnostics). |
| `lib/` | The news pipeline: feed parsing, country matching, scoring (`pipeline.js`, `countries.js`, `store.js`). |
| `test/` | Offline tests: `node test/pipeline.test.mjs` and `node test/functions.test.mjs`. |

## Build

```bash
python3 build.py
```

This writes `site/index.html`. Commit it together with your source changes.

## Deploy on Cloudflare Pages (free)

1. In the Cloudflare dashboard, go to **Workers & Pages → Create → Pages → Connect to Git**.
2. Pick this repository.
3. Use these build settings:
   - **Framework preset:** None
   - **Build command:** *(leave empty)*
   - **Build output directory:** `site`
4. Click **Save and Deploy**.

Every push to `main` then redeploys automatically, usually within a minute or two.

## Live news (stage 2)

The project deploys as a **Cloudflare Worker with static assets**. The configuration is in `wrangler.jsonc`:
- `site/` is served as the website.
- `/api/*` runs `worker/index.js`, which uses the handlers in `functions/api/`.
- The KV namespace `world-pulse-news` is bound as `NEWS` and holds the shared edition.

Bindings are set in `wrangler.jsonc`, not in the dashboard, because every deploy from Git applies this file.

To check that it's working, open `/api/status`.

### AI (stage 3)

The `AI` binding uses Cloudflare Workers AI on its free daily allowance. The code is in `lib/ai.js`.

- **Labels:** Llama 3.3 70B labels each new story with its country, the other country involved, a severity from 1 to 5 and its topics. Each refresh labels at most 90 new stories; the rest are labelled on the next refresh.
- **Briefings:** it writes the two-sentence country summaries and reuses each one until that country's headlines change.
- **Fallback:** if the AI is slow, unavailable or over its allowance, the keyword rules in `lib/pipeline.js` take over automatically.

## Roadmap

1. **Static site (done):** the globe runs on its own, using a bundled news snapshot.
2. **News pipeline (done):** refreshes when the app is opened, shared by all visitors. It pulls from GDELT and news feeds, then saves an edition.
3. **Free AI scoring (done):** Cloudflare Workers AI rates urgency, assigns topics and writes headlines.
4. **AI briefings and the "Get latest" button**, with caching and rate limits.
5. **Polish:** voices, error handling and an optional custom domain.
