# motion-landing
Motion Landing is a small progressive web application (PWA) that displays user-provided icons in SVG or PNG format as motion graphics. The application also starts a wake lock to prevent the device from going to sleep or shutting off the display.

## Features

- One full-screen page with a centered title and subtitle. It resizes to fit any screen and never shows scrollbars. Title words rise in out of a blur one after another, then a gradient accent bar grows in between the title and subtitle, and the subtitle follows. Highlighted words are filled with a shimmering gradient: wrap words in `*asterisks*` to highlight them, or leave out the asterisks to highlight the whole title.
- Up to 64 icons, picked at random from `icons/` on each server start, are drawn on a canvas as a slowly drifting, diagram-style scene. Nearby icons are joined by dashed elbow connectors with small data packets moving along them. Icons fade in one after another, one is swapped for another every few seconds, and they shift slightly with the pointer. Icons behind the title fade out, and three blurred colour orbs drift behind everything. When the user has asked for reduced motion, a single still frame is shown.
- Corner controls:
  - Top left: switch between the light and dark themes. Your choice is saved in the browser. The default follows your system setting.
  - Top right: the current UTC time in ISO 8601 format, for example `2026-10-27T21:54:14Z`.
  - Bottom left: turn the screen wake lock on or off. It is on by default.
  - Bottom right: edit the title and subtitle. Changes are saved in the browser.
- Installable as a PWA named "Motion Landing", with a TV icon. Works offline through a service worker.
- No runtime dependencies. You only need Node.js 20 or later.

## Running

```bash
npm start
```

The page is generated once at startup and kept in memory. Restart the server to pick a new set of icons.

| Variable    | Default                 | Description                                   |
|-------------|-------------------------|-----------------------------------------------|
| `HOST`      | `127.0.0.1`             | Interface to bind                             |
| `PORT`      | `8000`                  | Port to listen on                             |
| `ICONS_DIR` | `./icons`               | Directory scanned for `.svg` and `.png` icons |
| `TITLE`     | `Motion Landing`        | Default title                                 |
| `SUBTITLE`  | `Icons in fluid motion` | Default subtitle. Set it to empty to hide it. |

## Icons

Put `.svg` or `.png` files in `icons/`. The sample `sample-*.svg` files can be deleted. Hidden files, subdirectories, and symbolic links are ignored. The server only serves the icons it picked at startup. Icons are served with a sandboxing Content Security Policy, so scripts inside an SVG can't run.

## Deployment behind a reverse proxy

By default the server only listens on loopback (`127.0.0.1`). Put a TLS-terminating reverse proxy on the same host in front of it. HTTPS is also required for the screen wake lock and for PWA installation; browsers only allow these on `localhost` or over HTTPS. Example with nginx:

```nginx
location / {
    proxy_pass http://127.0.0.1:8000;
}
```

Only set `HOST` to a non-loopback address if the proxy runs on another machine. If you do, restrict the port to the proxy with a firewall or security group.

## Development

```bash
npm test            # unit and HTTP tests (node:test)
npm run app-icons   # regenerate the PWA PNG icons from the TV design
```
