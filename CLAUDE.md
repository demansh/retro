# RETRO — guide for agents

Static Jekyll site (GitHub Pages) with tiny retro games on a green phosphor CRT. Spec: `docs/SPEC.md`.

## Hard rules
- Vanilla JS ES modules only. No npm, no bundler, no external CDNs, no libraries.
- GitHub Pages runs Jekyll 3.x: no custom plugins, no Jekyll 4-only features.
- All URLs in templates go through `| relative_url` (`baseurl` is `/retro`). JS imports are relative paths.
- Controls are gestures only, no on-screen buttons: drag = move, tap = action, long press = pause,
  swipe from the left edge = exit to menu. Keyboard is a desktop extra.
- Landscape only. Portrait on touch devices shows the `ROTATE DEVICE` notice (handled by `_layouts/game.html` CSS).
- UI text is English uppercase (VT323 and the pixel font have no Cyrillic).
- Budget: a game page must stay under 100 KB gzip.

## Rendering model (important)
- Games draw into a low-res buffer (`createBuffer(192, 108)`) using rectangles and integer coordinates.
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
- `input` gesture recognizer; call `audio.unlock()` from `onInteraction` (needed on iOS).
- `collision` (`overlaps`, `sweptAabb` — use swept for fast objects), `particles` (pooled pixel bursts),
  `audio` (synthesized square/noise SFX, no audio files), `storage` (`createStore(id, version, defaults)`).

## Adding a game
1. `games/<id>/index.html` with front matter: `layout: game`, `title`, `description`, `script: /games/<id>/<id>.js`.
2. `games/<id>/<id>.js` — use `games/pong/pong.js` as the reference for wiring: buffer → crt → display → glitch,
   input handlers, state machine (title / play / paused / over), pause menu, exit via `crt.powerOff()` then
   navigate to `document.body.dataset.home`, records via `createStore("<id>", 1, defaults)` with sanitizing.
3. Add an entry to `_data/games.yml` (`id`, `title`, `tagline`, `url`). The menu renders from it.
4. Nothing to do for offline: `sw.js` precaches all pages and static files at build time.
5. Generic helpers belong in `engine/`; game-specific code stays in the game folder.

## Code style
- No comments or docstrings in code. Descriptive names, small functions, `const` by default.
- Handle failures visibly (`console.error` + `showSystemMessage`-style overlay), never silently.

## Verify
- `jekyll serve`, open `http://127.0.0.1:4000/retro/`.
- Check in a landscape mobile viewport with touch emulation; check portrait shows the rotate notice.
