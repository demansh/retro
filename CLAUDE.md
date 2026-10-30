# RETRO — guide for agents

Static Jekyll site (GitHub Pages) with tiny retro games on a green phosphor CRT. Spec: `docs/SPEC.md`.

## Hard rules
- Vanilla JS ES modules only. No npm, no bundler, no external CDNs, no libraries.
- GitHub Pages runs Jekyll 3.x: no custom plugins, no Jekyll 4-only features.
- All URLs in templates go through `| relative_url` (`baseurl` is `/retro`). JS imports are relative paths.
- Controls are gestures. The only on-screen control is the `II` menu icon in the top-right corner (drawn in the
  buffer by `engine/menubutton.js`); a tap on it toggles pause. Exit to the site menu
  only via `EXIT` in the pause menu. Never add edge swipes (from any screen edge) as a system gesture: they clash
  with OS back/notification gestures. All other gestures (drag, tap, long press, swipes) belong to the game.
  Keyboard is a desktop extra (Esc = pause).
- Every game works in both orientations. The buffer is letterboxed with black (`createDisplay`), never rotated.
  The preferred orientation is landscape, or portrait via `orientation: portrait` in front matter (see
  `games/breakout`). In the other orientation `_layouts/game.html` fades in a non-blocking `ROTATE FOR FULL SCREEN`
  hint. Never lock orientation, never pause on rotation; `manifest.webmanifest` stays `orientation: any`.
- Scale drags and swipes with `display.gestureScale()` (not `cssToBufferScale()`), so gesture sensitivity is the same
  in both orientations.
- UI text is English uppercase (VT323 and the pixel font have no Cyrillic).
- Budget: a game page must stay under 100 KB gzip.

## Rendering model (important)
- Games draw into a low-res buffer (`createBuffer(192, 108)`, portrait games `createBuffer(108, 192)`) using
  rectangles and integer coordinates.
- Draw in **grayscale only** (`#fff`, `#808080`, ...). The CRT shader (`crt.js`) converts luminance to green
  phosphor and adds curvature, scanlines, bloom, persistence trails, noise. Never draw in green yourself.
- Clear the buffer to black every frame; trails come from shader persistence, not from partial clears.
- In-canvas text uses `pixelfont.js` (3x5 glyphs: A-Z, 0-9, space and `- : . ! > < ? / _`).
  Unknown characters render as `?`; add glyphs there if needed.

## Engine (`assets/js/engine/`)
- `loop` fixed 60 Hz update + render, auto-suspends on hidden tab.
- `screen` buffer + display fit (`clientToBuffer`, `cssToBufferScale` for mapping gestures).
- `crt` renderer with WebGL1 and Canvas 2D fallback; `powerOn()` / `powerOff()` return promises.
- `glitch` effect scheduler: `trigger("tear" | "hit" | "goal")`, pass `uniforms()` to `crt.render`.
- `input` gesture recognizer; call `audio.unlock()` from `onInteraction` (needed on iOS). Pass
  `isMenuZone: menuButton.containsClient` and `onMenu`: touches that start in the zone never reach game handlers.
  Hold mechanics: `onPress` / `onRelease(x, y, isCancelled)` for pointers outside the menu zone, `onKeyUp` for keys.
- `menubutton` `createMenuButton(display, WIDTH)`: `draw(buffer, color)` each frame, `left` to lay out the HUD.
- `collision` (`overlaps`, `sweptAabb` — use swept for fast objects), `particles` (pooled pixel bursts),
  `audio` (synthesized square/noise SFX, no audio files, `setMuted`), `storage` (`createStore(id, version, defaults)`).
- `settings` global user settings (`sound`, `color`) in `retro:settings:v1`: `createSettings()` with `onChange`,
  `menuItems()` / `activate(id, step)` for menus, `readPalette()` for `crt.setPalette`.
- Palettes live only in `site.css` (`:root[data-color=...]` RGB triplets); the shader reads them via `readPalette()`.
  To add a color: a CSS block + an entry in `COLOR_OPTIONS`.

## Adding a game
1. `games/<id>/index.html` with front matter: `layout: game`, `title`, `description`, `script: /games/<id>/<id>.js`.
2. `games/<id>/<id>.js` — use `games/pong/pong.js` as the reference for wiring: buffer → crt → display → glitch,
   input handlers, state machine (title / play / paused / over), pause menu, exit via `crt.powerOff()` then
   navigate to `document.body.dataset.home`, records via `createStore("<id>", 1, defaults)` with sanitizing.
   Pause is opened by the menu icon (`onMenu`) and Esc/P, never by a game gesture.
   Pause menu must include `SETTINGS` (sub-view from `settings.menuItems()` + `BACK`), and wire
   `settings.onChange(({ sound }) => { audio.setMuted(!sound); crt.setPalette(readPalette()); })`.
3. Add an entry to `_data/games.yml` (`id`, `title`, `tagline`, `url`). The menu renders from it.
4. Nothing to do for offline: `sw.js` precaches all pages and static files at build time.
5. Generic helpers belong in `engine/`; game-specific code stays in the game folder.

## Code style
- No comments or docstrings in code. Descriptive names, small functions, `const` by default.
- Handle failures visibly (`console.error` + `showSystemMessage`-style overlay), never silently.

## Verify
- `jekyll serve`, open `http://127.0.0.1:4000/retro/`.
- Check in landscape and portrait mobile viewports with touch emulation: the game is letterboxed and playable,
  the rotate hint shows only in the non-preferred orientation and fades out.
