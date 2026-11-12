# Phonograph

**A little closer to the music.** An interactive 3D study of the modern belt-drive turntable, ready for GitHub Pages from `docs/`.

Explore ten component groups with a continuous exploded view, orbit and zoom, anchored annotations, close inspection of individual parts, a six-moment guided tour, and a removable acrylic cover. Three original listening-room compositions accompany the model; the arm swings onto the record during playback, and 33⅓/45 RPM controls change both rotation speed and audio pitch. A separate illustrated story follows the groove through the stylus, cartridge, phono stage, amplifier and speakers.

The deck is an original interpretation of a classic modern manual turntable. Early phonographs and gramophones are intentionally outside this first volume.

## Run locally

Requires Node.js 20.19+ (or 22+) and npm.

```sh
npm ci
npm run dev
```

The checked-in assets are ready to use. Blender, Python and FFmpeg are only needed to regenerate them. The site has no backend, tracking, remote fonts, CDN imports, or streaming-service dependency. Music starts only on user action. Audio pauses when the deck is exploded or the page becomes hidden.

## Build for GitHub Pages

```sh
npm run build
npm test
```

Commit the generated `docs/` directory. In **Settings → Pages**, choose **Deploy from a branch**, **main**, and **/docs**. The expected project URL is `https://wlamason.github.io/phonograph/`. Vite's relative base also supports a custom domain and local subdirectory hosting. `public/.nojekyll` is copied into the output.

```sh
npm run preview
```

This serves the production output locally. No GitHub Actions build is required for Pages; a CI workflow verifies the committed output and tests on pushes/PRs.

## Rebuild all assets

Install Blender 4.2+, FFmpeg with `libmp3lame`, Python 3 with NumPy, and Node.js.

```sh
python -m pip install -r requirements-dev.txt
bash scripts/rebuild.sh
```

Or run stages independently:

```sh
npm run models   # Blender → editable blend, GLB, metadata, preview
npm run audio    # deterministic original compositions → three local MP3s
npm run build    # source + public assets → docs/
npm test
```

The Blender stage takes a few minutes for its Cycles preview. For geometry-only work:

```sh
blender -b --factory-startup --python-exit-code 1 --python models/turntables/classic_belt_drive/build.py -- --skip-preview
```

## Source map

| Path | Purpose |
| --- | --- |
| `models/turntables/classic_belt_drive/` | Blender script, editable model, GLB, metadata and studio preview |
| `src/scene.js` | Three.js loading, part transforms, lighting, camera, picking and annotations |
| `src/content.js` | Component explanations, tour, signal story and track metadata |
| `src/main.js` | Accessible exhibit controls, guided tour, illustrations and audio |
| `src/style.css` | Responsive listening-room design and reduced-motion behavior |
| `scripts/build_audio.py` | Three deterministic, sample-free original compositions |
| `public/` | Local media copied into each build |
| `docs/` | Complete, checked-in GitHub Pages site |
| `tests/` | DOM interactions, actual GLB geometry/fit checks and Pages-path validation |

## Verification

`npm test` checks real exported model structure, the stylus/record contact height and playback position, default desktop/mobile camera fit, the model delivery budget, relative Pages asset paths, all component navigation, tour completion, playback/explosion transitions, speed selection, and keyboard tab navigation. DOM tests isolate the WebGL renderer; they do not replace visual browser testing or audio listening. The build environment did not expose its shared browser-control tool, so interactive browser QA remains a stated verification limit.

## Credits and licenses

The model, procedural grain, diagrams and three audio compositions are original. The compositions and generated model assets are dedicated under **CC0 1.0**; source code is **MIT**. Instrument Serif and DM Sans are bundled through Fontsource under the **SIL Open Font License**. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and [RESEARCH.md](RESEARCH.md).
