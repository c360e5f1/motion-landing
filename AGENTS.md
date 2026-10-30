# AGENTS.md

Guide for agents and contributors working on Motion Landing: what the app does, how the parts fit together, and the rules to keep when changing it.

## What it is

Motion Landing is a dependency-free Node.js (20+) web server plus a single-page progressive web application. It shows a full-screen title and subtitle over an animated canvas scene built from user-provided `.svg`/`.png` icons, and holds a screen wake lock so the display stays on (kiosk, TV, or wall-display use).

- No runtime or dev dependencies. `package.json` only has scripts. Tests use `node:test`.
- ES modules on the server (`"type": "module"`). Browser code is plain scripts (no bundler, no build step).
- License: GPL-3.0-only.

## Repository layout

```
server.js                    Entry point: reads config, scans icons, renders page once, starts HTTP server
lib/icons.js                 listIcons() directory scan, selectIcons() random pick (MAX_ICONS = 64)
lib/render.js                escapeHtml(), renderIconMarkup(), plainTitle(), renderPage() template fill
lib/server.js                createHandler(): routing, static files, security headers, CSP
templates/index.html         Page template with {{TITLE}}, {{TITLE_TEXT}}, {{SUBTITLE}}, {{ICONS}}
public/app.js                All client behaviour: theme, clock, title/editor, wake lock, canvas scene, SW registration
public/styles.css            Design tokens (light/dark), layout, text animations, orbs, controls, dialog
public/theme-init.js         Runs before first paint: applies saved/system theme, adds `js` class
public/sw.js                 Service worker (offline support, cache name `motion-landing-vN`)
public/manifest.webmanifest  PWA manifest
public/app-icons/            TV app icon (tv.svg) and generated PNGs (192, 512, maskable 512)
scripts/generate-app-icons.mjs  Dependency-free SDF rasteriser that regenerates the PNG app icons
icons/                       Sample icons (sample-*.svg); replaced or mounted over by the user
test/                        icons.test.js, render.test.js, server.test.js (22 tests)
Dockerfile                   node:alpine image, runs as `node` user, HOST=0.0.0.0, PORT=8080
.github/workflows/main.yml   Builds and pushes ghcr.io image on push to `main`, with attestation
```

## Commands

```bash
npm start           # node server.js
npm test            # node --test (unit + HTTP tests)
npm run app-icons   # regenerate public/app-icons/*.png from the TV design
```

There is no linter or formatter configured. Match the existing style: 2-space indent, single quotes, semicolons, trailing commas, JSDoc on exported functions.

## Request lifecycle

### Startup (server.js)

1. Build config from environment variables:

   | Variable    | Default (in code)        | Notes |
   |-------------|--------------------------|-------|
   | `HOST`      | `127.0.0.1`              | Loopback by default; meant to sit behind a TLS reverse proxy |
   | `PORT`      | `8080`                   | Validated as integer 0-65535. README currently says 8000; the code says 8080 |
   | `ICONS_DIR` | `./icons` (resolved)     | |
   | `TITLE`     | `Motion Landing`         | Empty falls back to the default (`||`) |
   | `SUBTITLE`  | `Icons in fluid motion`  | Empty string is kept (`??`) and hides the subtitle |

2. `listIcons(dir)` returns sorted names of regular files with `.svg`/`.png` extensions, skipping dotfiles, directories and symlinks (`Dirent.isFile()` is false for symlinks). A missing directory returns `[]`.
3. `selectIcons(names, 64)` does a partial Fisher-Yates shuffle and returns up to 64 distinct names.
4. `renderPage()` fills the template in a single regex pass, so values containing `{{...}}` or `$` patterns are never re-expanded. All values are HTML-escaped; icon names are also `encodeURIComponent`-ed.
5. The resulting HTML is held in memory for the life of the process. A new icon selection requires a restart.
6. SIGINT/SIGTERM close the server, with a 5 s forced exit.

### Routing (lib/server.js)

- Only `GET` and `HEAD`; anything else gets 405.
- The path is URL-decoded. Malformed encoding, NUL bytes and backslashes get 400.
- `/` and `/index.html` serve the in-memory page with a strict `PAGE_CSP` (self only, no inline script or style) and `Permissions-Policy: screen-wake-lock=(self)`.
- `/icons/NAME`: the name must exactly match one of the icons selected at startup (allowlist `Set`), otherwise 404. Served with `ICON_CSP` (`default-src 'none'; style-src 'unsafe-inline'; sandbox`) so SVG scripts can't run if opened directly, and `Cache-Control: public, max-age=86400`.
- Everything else is served from `public/`. Any segment starting with `.` gets 404, and the resolved path must stay inside `public/`.
- Static files support `If-Modified-Since` (304) and are sent with `Cache-Control: no-cache`.
- Every response gets `nosniff`, `no-referrer`, COOP/CORP `same-origin`, and `X-Frame-Options: DENY`.

Because of the CSP, the page must never use inline `<script>`, inline `style=""` attributes in the template, or third-party resources. (Setting `element.style` from JavaScript is allowed; app.js does this for animation delays.)

## Page structure (templates/index.html)

Back to front:

1. `.motion-layer` (`aria-hidden`, `pointer-events: none`):
   - three `.orb` divs: large blurred colour fields drifting with CSS keyframes (24/28/32 s, alternate)
   - `<canvas id="scene">`: icons, connectors and data packets
   - `.veil`: radial scrim behind the title
   - `#icon-sources` (`display: none`): the server-selected `<img class="motion-icon">` elements, used only as canvas image sources
2. `<main id="hero">` holds `data-default-title` (raw, with `*markers*`) and `data-default-subtitle`, plus `#title`, `#rule` (gradient accent bar) and `#subtitle`.
3. Corner controls: `#theme-toggle` (top left), `<time id="clock">` (top right), `#wake-toggle` (bottom left), `#settings-open` (bottom right).
4. `<dialog id="settings-dialog">` with the title/subtitle form.
5. `#status`: a visually hidden `aria-live` region used by `announce()`.

## Client behaviour (public/app.js)

Everything is inside one IIFE. Persistent state uses `localStorage` with the prefix `motion-landing:` (keys `theme`, `title`, `subtitle`, `wake`), wrapped in try/catch for private mode.

### Theme

`theme-init.js` runs synchronously in `<head>`. It applies the saved theme, or the system `prefers-color-scheme`, and adds the `js` class (which hides the plain server-rendered title until app.js builds the animated words). `applyTheme()` sets `data-theme` and the `theme-color` meta tag (`THEME_COLORS`), updates the button label, and calls `scene.refreshColors()` so the canvas picks up `--scene-line` / `--scene-packet`.

### Clock

UTC ISO 8601 at second precision (`2026-10-27T21:54:14Z`). It re-schedules itself to the next second boundary so it never drifts.

### Title, subtitle and editor

- `renderTitle(raw)` splits the title into one `<span class="word">` per word with staggered `animationDelay` (0.2 s + 0.1 s per word). Words inside `*asterisks*` get `word-highlight` (gradient text). If there are no markers, every word is highlighted. Text is only ever set with `textContent`.
- After all the words are in (`1200 ms + 100 ms × words`), `.is-revealed` starts the 8 s gradient shimmer.
- Entrance order, top to bottom: last word, then the accent bar (`0.4 s + 0.1 s × words`), then the subtitle (0.2 s later). `replay()` restarts their CSS animations.
- The dialog edits the raw title (with markers). It rejects a title that is empty after stripping markers. Values equal to the server defaults are removed from storage rather than saved. "Reset to defaults" only refills the inputs. Clicking the backdrop or Cancel closes the dialog, and focus returns to the open button.

### Screen wake lock

The state machine has four states: `unsupported`, `off`, `pending`, `on`. These map to `data-state`, `aria-pressed` and labels on the button. The lock is wanted by default (`wake` key `!== 'off'`). It is re-acquired on `visibilitychange` to visible, and on the first `pointerdown` anywhere, because some browsers need a user gesture. Failures leave the state `pending` so the next interaction retries. The lock needs HTTPS or `localhost`.

### Motion scene (`createScene()`)

The scene is canvas-based and starts once every `#icon-sources` image has decoded. Images that fail to load are skipped. If no images load, nothing is drawn.

Sizing:
- `baseSize() = clamp(min(W, H) × 0.075, 34, 76)` px
- `cellSize() = baseSize × 3.1` (the original one-icon-per-cell grid)
- `ICON_DENSITY = 2`: each grid cell is split into 2 side-by-side slots, one icon per slot
- Device pixel ratio is capped at 2.

Population (`populate()`): a jittered grid of `round(W/cell) × round(H/cell)` cells × `ICON_DENSITY` slots. Each slot is skipped with probability 0.28 to leave natural gaps. Each node has a random `depth` from 0.55 to 1.1, which scales size, speed, parallax, shadow and opacity. Entrance is staggered with a negative `life` of up to -1.2 s.

On resize, existing nodes are rescaled to the new viewport. The count is then rebalanced toward `W·H / cell² × 0.72 × ICON_DENSITY`, give or take 3.

The server's 64-icon cap limits only the pool of distinct images, not how many appear on screen. `pickImage()` prefers images that aren't already on screen, so icons repeat only once the screen holds more nodes than the pool.

Per frame (`step(dt)`, with dt capped at 50 ms):
- Linear drift: `vx` up to ±9 px/s and `vy` up to ±7 px/s, scaled by depth. Nodes wrap around the edges with a margin of 1.5 × baseSize.
- Pointer parallax is smoothed toward the target (pointer offset × 18 px × depth).
- Fade-in at 0.9/s, fade-out at 1.2/s.
- Every ~2 s one fully visible node is marked `dying`. When it has faded out, it gets a new image and fades back in.
- Data packets spawn at a rate of about 6/s. The cap is max(6, 0.4 × nodes). Each packet travels between a random node and a nearby node (a random pick that leans toward the nearest, within 5 × baseSize) at a speed of 0.35–0.7 path lengths per second.

Drawing (`draw(time)`):
- Connectors: every pair of nodes within `4.2 × baseSize` is checked (an O(n²) pair loop). Each connector is an orthogonal elbow path (`connectorPath`), drawn dashed `[4, 6]` with a marching-ants offset. Alpha depends on distance, entrance progress, depth and `centerFade`.
- Packets: 6 trail dots along the path, fading in and out with `sin(πt)`.
- Icons: drawn far to near (sorted by depth), with a scale-in from 0.6 to 1, a depth-scaled drop shadow, and alpha multiplied by `centerFade`.
- `centerFade(x, y)` is an elliptical falloff around the centre (radii 0.36·W and 0.26·H) with a floor of 0.08, so icons behind the title nearly vanish.

Lifecycle: the animation loop stops while the tab is hidden and resumes when it's visible again. Under `prefers-reduced-motion: reduce`, the scene draws a single still frame (no packets, everything fully visible) and redraws on resize or theme change. CSS also turns off the orbs and text entrance animations.

## PWA / service worker (public/sw.js)

- Precaches the app shell on install, deletes old caches on activate, and calls `skipWaiting` and `clients.claim`.
- Navigations are network-first and cached under `/`, because the page changes with each server start.
- `/icons/*` is cache-first. Other same-origin GETs are stale-while-revalidate.
- Bump `CACHE_NAME` (currently `motion-landing-v7`) whenever a shell file changes, so clients pick up the new version.

## Deployment

- Bare Node: keep `HOST=127.0.0.1` and put a TLS-terminating proxy in front. HTTPS is needed for the wake lock and PWA install.
- Docker: the image sets `HOST=0.0.0.0` and `PORT=8080`, runs as the `node` user, and has a `wget` healthcheck. Publish to loopback (`-p 127.0.0.1:8080:8080`) behind the proxy, and mount icons at `/app/icons`.
- CI (`.github/workflows/main.yml`) builds and pushes `ghcr.io/<repo>:latest` on push to `main`. (The comment there mentions a `release` branch, but the trigger is `main`.)

## Tests

`npm test` runs 22 tests, all of which currently pass:
- `icons.test.js`: selection bounds and randomness, no input mutation, filtering of hidden files, directories, symlinks and other extensions, missing directory.
- `render.test.js`: escaping, placeholder filling, no re-expansion, one `<img>` per icon, no inline script or style, title marker handling.
- `server.test.js`: page security headers and CSP, content types, HEAD, 304, icon allowlist and sandbox CSP, traversal, dotfile, malformed path and backslash rejection, 404s, method allowlist.

There are no automated tests for `public/app.js`. To check client logic without a browser, run it in a `node:vm` sandbox with stub DOM/canvas objects (for example, a Proxy-based 2D context that counts draw calls and a fake `requestAnimationFrame` queue). Write the harness to `/tmp` and delete it afterwards. The agent shell has no browser or image tools, so say so instead of claiming visual verification.

## Rules for changes

- Naming: never write the names of the design system or cloud vendor this style is based on (or their parent company) anywhere in the repository. This covers code, comments, docs and tests, including "guard" tests that would contain the words literally. Describe the style generically ("design tokens", "light/dark theme").
- Dark theme: the background-type tokens (bg, glow, surfaces, hover/input fills, scrim) and orb opacities are 80% of the original values. `--color-bg` `#0c1622` must stay in sync across `templates/index.html` (`theme-color`), `THEME_COLORS` in app.js, and `manifest.webmanifest`. Text, border, accent tokens and the light theme are deliberately unchanged.
- Motion style to keep: the canvas diagram scene described above (jittered grid, linear drift with wrap, sin/cos float, depth parallax, elbow dashed connectors, packets with trails, staggered entrance, ~2 s swaps, centre fade and veil, CSS orbs, still frame under reduced motion). A DOM-based flow-field style (rotation, breathing scale, pointer repulsion) was rejected.
- Title styling to keep: weight 800, line-height 1.04, `.hero-content { max-width: 90vw }` with no inline padding, the accent bar between title and subtitle, and the `.word-highlight` padding/negative-margin trick (`0.08em 0.06em 0.18em`) that stops `background-clip: text` from clipping descenders.
- Icon density: `ICON_DENSITY = 2` (twice the original density) was an explicit user choice. Keep it when reworking the scene.
- When changing motion, don't modify the icons or other graphics (sample icons, TV app icon, corner button icons).
- Security: keep the CSP strict (no inline script or style, no external origins), the icon allowlist and sandbox CSP, loopback-by-default binding, and the traversal and dotfile checks. Any change to routes, handlers or binding must keep `test/server.test.js` passing, and should add tests for new behaviour.
- After editing shell assets (`/`, `styles.css`, `app.js`, `theme-init.js`, manifest, app icons), bump `CACHE_NAME` in `public/sw.js`.
- No new dependencies. The project is intentionally dependency-free.
