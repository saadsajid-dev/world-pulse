# World Pulse

An interactive 3D globe and flat map of world news. Each country is coloured by how urgent its news is: critical, emerging, minor or no news.

## Project layout

| Path | What it is |
|---|---|
| `site/index.html` | The built website, a single self-contained file. This is what gets deployed. |
| `src/template.html` | The app source (HTML, CSS and JavaScript). Edit this file, then rebuild. |
| `data/` | The map geometry, country lists and the bundled news snapshot (`news.json`). |
| `build.py` | Combines `src/` and `data/` into `site/index.html`. |

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

## Roadmap

1. **Static site (current stage):** the globe runs on its own, using a bundled news snapshot.
2. **News pipeline:** refreshes when the app is opened, shared by all visitors. It pulls from GDELT and news feeds, then saves an edition.
3. **Free AI scoring:** Cloudflare Workers AI rates urgency, assigns topics and writes headlines.
4. **AI briefings and the "Get latest" button**, with caching and rate limits.
5. **Polish:** voices, error handling and an optional custom domain.
