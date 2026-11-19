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

## Live news setup (stage 2)

The site keeps one shared news edition in Cloudflare KV.
When someone opens the app and the edition is more than an hour old, it refreshes from the newswires for everyone.

1. **Workers & Pages → KV → Create namespace**, named `world-pulse-news`.
2. Open the Pages project, then go to **Settings → Bindings → Add → KV namespace**.
   - **Variable name:** `NEWS`
   - **Namespace:** `world-pulse-news`
3. Redeploy: push a commit, or use **Deployments → Retry deployment** on the latest one.

To check that it's working, open `/api/status`.

## Roadmap

1. **Static site (done):** the globe runs on its own, using a bundled news snapshot.
2. **News pipeline (current stage):** refreshes when the app is opened, shared by all visitors. It pulls from GDELT and news feeds, then saves an edition.
3. **Free AI scoring:** Cloudflare Workers AI rates urgency, assigns topics and writes headlines.
4. **AI briefings and the "Get latest" button**, with caching and rate limits.
5. **Polish:** voices, error handling and an optional custom domain.
