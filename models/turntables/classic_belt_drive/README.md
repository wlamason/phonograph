# The modern classic

An original educational interpretation of a manual belt-drive hi-fi turntable: oiled walnut cabinet, machined aluminium platter, felt mat, a 12-inch LP, isolated motor, belt and subplatter, steel/brass bearing, gimbal tonearm, moving-magnet cartridge, four damped feet, and removable smoked acrylic cover.

This follows the model-per-directory convention in `wlamason/lovable-hackathon-2026`. The model is not a replica of a commercial product. The motor and cartridge internals are simplified; visible concentric groove bands stand in for the real continuous spiral.

```sh
blender -b --factory-startup --python-exit-code 1 --python models/turntables/classic_belt_drive/build.py
```

Run from the repository root. Outputs: `model.blend`, `model.glb`, `metadata.json`, and `preview.png`. The GLB, metadata, and preview are also copied into `public/models/` for the site build. Rebuilds are deterministic; Blender previews can vary slightly by renderer/version. Use Blender 4.2 or newer. No add-ons or downloaded model assets are required. Blender's bundled NumPy creates the packed walnut grain.

Use `-- --skip-preview` for a fast geometry-only rebuild. Use `-- --outdir /absolute/path` to build elsewhere without copying into the site's public directory.

Dimensions: 450 × 350 × 208 mm including cover. Blender uses meters, Z up, front facing −Y. glTF is Y up, front +Z. Browser display scale is 10. Each top-level part is an Empty with `partId` and `explode` extras. Explosion vectors are browser-display units; divide by 10 when applying them inside the scaled GLB root.

The record, mat and platter have origins on the spindle, so they can rotate without orbiting the cabinet. The tonearm origin is on its pivot. The cartridge is separate to permit its own exploded position, then follows that pivot during playback.

The saved `.blend` opens assembled with its studio camera and lights. The cover is hidden from the preview but remains in the exported GLB, where the user can reveal it. Studio geometry and lights are excluded from the GLB.
