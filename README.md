# RETRO

Tiny retro games on a green phosphor CRT. Static Jekyll site for GitHub Pages, no build step, no dependencies.

## Run locally

```sh
jekyll serve
```

Open http://127.0.0.1:4000/retro/

## Deploy

Push to GitHub and enable Pages for the `master` branch. `baseurl` in `_config.yml` must match the repository name.

## Add a game

1. Create `games/<id>/index.html` with `layout: game` and `script: /games/<id>/<id>.js`.
2. Build the game on top of `assets/js/engine/`.
3. Register it in `_data/games.yml`.

Spec: [docs/SPEC.md](docs/SPEC.md). Font: VT323, SIL Open Font License (`assets/fonts/VT323-OFL.txt`).
