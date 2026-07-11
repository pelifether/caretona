# Caretona 😜

A mobile-first, browser-based face-matching mini-game inspired by Mario Party's classic **Face Lift**.

A cartoon reference face pulls a ridiculous expression (a *careta*). You get 6 seconds to
mimic it with your own face in the front camera. At the flash, your face is frozen,
"scanned", and scored from **0 to 100**.

## How it works

- **Face tracking** — [MediaPipe Face Landmarker](https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker)
  running entirely on-device (WASM/GPU). The camera feed never leaves the browser.
- **Scoring** — the player's face is reduced to 52 ARKit-style **blendshape** coefficients
  (`jawOpen`, `mouthPucker`, `browInnerUp`, …). Each careta is *authored* as a target
  blendshape vector, so reference and player are compared in the same semantic space —
  invariant to face shape, head pose, and camera distance. Missing an activation is
  penalized more than overshooting it; symmetric poses are also checked mirrored.
- **Reference face** — fully procedural canvas rendering driven by the same blendshape
  parameters. No image assets, no licensing, and the pose you see is exactly the pose
  being scored.
- **Cost** — static hosting only. No backend, no APIs, no inference servers.

## Develop

```sh
npm install
npm run dev
```

- Open `http://localhost:5173/?mock=1` to play with a **mock camera + fake player**
  (useful on machines without a webcam, or for testing the full flow quickly).
- Real camera requires HTTPS (or localhost).

## Build & deploy

`npm run build` outputs a static site to `dist/`. Pushing to `main` auto-deploys to
GitHub Pages via `.github/workflows/deploy.yml`.

## Roadmap

- [ ] Multiplayer ("INVITE FRIEND") — WebRTC data channel, both players mimic the same careta.
- [ ] Sound effects & haptics.
- [ ] Share card (frozen face + score) via the Web Share API.
