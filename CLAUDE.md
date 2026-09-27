# WebDJ Pro — notes for Claude

Two-deck DJ app in the browser (Web Audio API, no build step) + a tiny Python
server that extracts YouTube audio with yt-dlp. The user is a beginner DJ who
plays mostly reggaeton / latin, speaks Spanish, and uses a MacBook Air touchpad
(Chrome, often fullscreen at ~1470×900). **All UI text for the user is Spanish.**

## Run / test
- `python server.py` → http://localhost:8000 (serves the app, `/api/status`, `/api/convert`).
- No test suite. Verify changes headlessly with Playwright + Chromium
  (`executablePath: '/opt/pw-browsers/chromium'`); stub `download_audio` in
  `server.py` to test the converter without YouTube (YouTube is blocked in the
  sandbox). CDNs (tailwind, font-awesome) are blocked too: route them to a
  locally built CSS when a screenshot is needed.
- Syntax check: `node -e "new Function(require('fs').readFileSync('js/app.js','utf8'))"`.

## Files (classic scripts sharing globals, loaded in this order)
- `js/analysis.js` — `Analysis.analyzeTrack(buffer)`: BPM + beat grid (`firstBeat`,
  `downbeat`, `beatSec`), key (Camelot), loudness, energy per bar, `mixIn`,
  `introEnd` (= first drop), `breakdowns`, `outroStart`, `mixOut`, `mixBars`.
- `js/fx.js` — `FXUnit` per deck (echo, reverb, flanger, phaser, trans, roll), `Sampler`.
- `js/engine.js` — `Deck` (transport, native loops, roll with slip, brake, spinback,
  auto gain `trim`), mixer bus, demo track generator.
- `js/app.js` — UI templates, knobs, waveforms, sync, **mix coach**
  (`planTransition` → steps executed by `tickAutoMix`, modes `auto`/`guide`),
  library, keyboard, converter, frame loop.
- `js/profe.js` — **DJ PROFE**: tips from the musical context, tricks timed to
  drops, live review chips ("TU MEZCLA"), modes CONSEJOS / GUIADO / AUTOMÁTICO.

## DJ rules the app follows (keep them when changing things)
- **Pitch/tempo:** no key lock, so pitch changes the voice. Mixes never push the
  pitch past ±6% (`MAX_MIX_PITCH`), SYNC past ±8%. If tempos are further apart
  use ECHO OUT (new track at its own speed). After a mix, return the new track's
  pitch to 0 slowly (32 bars).
- **Pace:** reggaeton/latin/hip-hop (< 112 BPM) mix *early*: at a phrase boundary
  after ~1 min where the energy drops (end of a chorus), 8-bar transitions.
  House/techno mix in the outro, 16–32 bars.
- **Phrasing:** everything happens on 8-bar phrases; the incoming track starts
  exactly N bars before its drop so the drop lands when the transition ends.
- **EQ:** never two basslines at once (bass swap halfway); swap the mids too
  (vocals); knobs go back to 0 after a mix; boosting over 0 saturates.
- **Effects:** short doses with safe limits (`FX_LIMITS` in profe.js): echo on
  phrase ends / echo out, reverb in breakdowns, flanger / filter rise / roll /
  trans only in the build-up into a drop.
- **Beginner UX:** one click on a highlighted control glides it to its target,
  Space applies the whole step; the layout must fit a laptop screen without zooming.
