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
- **Multiplayer** — WebRTC peer-to-peer via [PeerJS](https://peerjs.com). The free public
  broker is used for signaling only; video and game messages flow directly between the
  two players. "INVITE FRIEND" generates a `?join=<room>` link; rounds are host-driven
  (host picks the careta, both play simultaneously, scores are exchanged over the data
  channel, and a ready-handshake gates the next round). Note: without a TURN relay,
  a small fraction of restrictive-NAT pairs may fail to connect.
- **Face styles** — the button at the bottom-left of the stage cycles through three
  reference faces: the emoji toon, a procedural "2.5D" human (both plain canvas), and a
  **true-3D photoscanned head** rendered with three.js. The 3D head ships with all 52
  ARKit morph targets — the exact vocabulary the caretas are authored in — so every pose
  drives it natively. The 3D bundle (~900 kB gzipped: three.js chunk, model, texture
  transcoder) is lazy-loaded only the first time you switch to it and cached after;
  the base game payload is unchanged. Head-scan sample model from the
  [Face Cap](https://bannaflak.com/face-cap/) app, via the three.js examples.

## Develop

```sh
npm install
npm run dev
```

- Open `http://localhost:5173/?mock=1` to play with a **mock camera + fake player**
  (useful on machines without a webcam, or for testing the full flow quickly).
- Real camera requires HTTPS (or localhost).

End-to-end tests (need Google Chrome installed; dev server running on :5199):

```sh
node scripts/solo-test.mjs    # solo round, face toggle, live bubble, BYE flow
node scripts/mp-test.mjs      # full 2-player round over real WebRTC + cancel/disconnect
node scripts/face-gallery.mjs # renders all face styles across poses for visual review
node scripts/perf-test.mjs    # per-style FPS, 3D payload/load time, solo round in 3D
```

## Build & deploy

`npm run build` outputs a static site to `dist/`. Pushing to `main` auto-deploys to
GitHub Pages via `.github/workflows/deploy.yml`.

## Roadmap

- [ ] Sound effects & haptics.
- [ ] Share card (frozen face + score) via the Web Share API.
- [ ] Self-hosted signaling + TURN for stubborn NATs.
