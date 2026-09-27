# WebDJ Pro — notes for Claude

Two-deck DJ app in the browser (Web Audio API, no build step) + a tiny Python
server that extracts YouTube audio with yt-dlp. The user is a beginner DJ who
talks about reggaeton / latin but whose real library (historial, 66 tracks) is mostly
melodic techno, tech house and afro house at 113–140 BPM (Anyma, Illumi Music extended
mixes, live edits); speaks Spanish, and uses a MacBook Air touchpad
(Chrome, often fullscreen at ~1470×900). **All UI text for the user is Spanish.**

## Run / test
- `python server.py` → http://localhost:8000 (serves the app, `/api/status`,
  `/api/convert`, and `POST /api/mp3` which turns a recorded mix into a 320 kbps MP3 with ffmpeg).
  `index.html` is served with `?v=<mtime>` on every script and the version (last
  commit) shows next to the logo: if the user reports old behaviour, check that
  version first (they may not have pulled / restarted).
- No test suite. Verify changes headlessly with Playwright + Chromium
  (`executablePath: '/opt/pw-browsers/chromium'`); stub `download_audio` in
  `server.py` to test the converter without YouTube (YouTube is blocked in the
  sandbox). CDNs (tailwind, font-awesome) are blocked too: route them to a
  locally built CSS when a screenshot is needed.
- Syntax check: `node -e "new Function(require('fs').readFileSync('js/app.js','utf8'))"`.

## Real-session history (read this before tuning analysis or the profe)
The user shares their sessions with **COMPARTIR HISTORIAL** (library header): `server.py`
merges them into `historial/` (gitignored) and publishes an orphan-style branch
**`historial`** with git plumbing (never touches the working branch). Read it with
`git fetch origin historial && git show origin/historial:tracks.json` (and `mixes.json`).
- `tracks.json`: per track, the analysis (bpm, key, firstBeat/downbeat, mixIn, introEnd,
  breakdowns, outroStart, musicEnd…), `energyPerBar` {low,mid,high}, the user's hot `cues`,
  and `bpmDetected` vs `bpm` (+ `bpmFixed`) = where BPM detection failed.
- Findings so far (Sept 2026): extended mixes keep kick + bass in the outro, so the old
  energy-based outro sat at the very end (65/66 tracks got mixBars 8, mixes shrank to 4
  bars, the user came in 58 bars before the "ideal" point) → analysis v6 `refineOutro`
  (lead = mids + highs). Live edits / visualizers have no DJ outro: ≥16 bars are kept.
- Round 2 (11 mixes, 3 👎): the user enters ~55–79 bars before the "ideal" point (mixes
  mid-track, 15–35 s transitions); both filter mixes over clashing keys got 👎 → clashing
  keys now = echo out; every echo out jumped +10 dB (quiet outro straight into the drop)
  → the drop is used only if the old track is loud where you cut, echo level 0.6; ending
  early left the new track EQ-cut (−17 dB) → `afterMixTargets` lights its knobs to 0.
  Mix logs now carry `analysisVersion` (compare v6+ mixes only when tuning the ideal point).
- `mixes.json`: per mix, the plan (style, pace, bars, dropAtEnd, introLoop…), `startedBarsFromIdeal`,
  master level range vs the track alone, warnings shown, `result` (done/early/cancelled) and
  the user's `rating` (good/bad). No audio is ever uploaded.

## Files (classic scripts sharing globals, loaded in this order)
- `js/store.js` — IndexedDB store for the library (tracks with bytes, analysis,
  `cues`, `bpmFixed`). Bump `Analysis.VERSION` when the analysis changes: stale
  saved tracks are re-analysed in the background on startup.
- `js/analysis.js` — `Analysis.analyzeTrack(buffer)`: BPM + beat grid (`firstBeat`,
  `downbeat`, `beatSec`), key (Camelot), loudness, energy per bar, `mixIn`,
  `introEnd` (= first drop), `breakdowns`, `outroStart`, `mixOut`, `mixBars`.
- `js/fx.js` — `FXUnit` per deck (echo, reverb, flanger, phaser, trans, roll), `Sampler`
  (8 synthesized pads in `SAMPLER_PADS`, each with `sync` 'end'/'bar'/'beat' and a `when`
  text; `padTiming` in app.js puts them on the playing track's grid; own samples per pad
  in `Store.pads`). The profe lights SUBIDA 3–8 bars before a drop and IMPACTO right before it.
- `js/engine.js` — `Deck` (transport, native loops, roll with slip, brake, spinback,
  auto gain `trim`), mixer bus, demo track generator.
- `js/app.js` — UI templates, knobs, waveforms, sync, **mix coach**
  (`planTransition` → steps executed by `tickAutoMix`, modes `auto`/`guide`),
  library, keyboard, converter, frame loop.
- `js/cue.js` — **headphones (CUE/PFL)**: MASTER to the speakers via `AudioContext.setSinkId`,
  CUE bus (each deck's `filterNode`, pre-fader, + master via CUE ↔ MASTER) to a second
  device through a MediaStream `<audio>` with its own `setSinkId`. The cue never plays
  until a headphone device different from the speakers is chosen (no leaks to the party).
  Guided prep adds "prende el CUE 🎧 del B" when headphones are set.
  On a MacBook the internal speakers and the headphone jack are ONE output (plugging
  headphones mutes the speakers and 'default' becomes the jack): `sameOutput()` resolves
  'default' by groupId and refuses/warns when speakers and headphones are the same device.
- `js/history.js` — `Historial`: mix log (localStorage `webdj-mixlog`, hooks in
  startAutoMix / guidedStart / finish / cancel, 👍/👎 in the after-mix tip) + export.
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
- **YouTube videos:** many open/close with talking, skits or ambience. Only bars
  with a repeating beat count as music (`rhythmPerBar`): `mixIn`/`phraseStart`
  = where the groove starts, `musicEnd` = where it ends. Never mix over the talking.
- **Phrasing:** everything happens on 8-bar phrases counted from `phraseStart`; the incoming track starts
  exactly N bars before its drop so the drop lands when the transition ends.
- **EQ:** never two basslines at once (bass swap halfway); swap the mids too
  (vocals); knobs go back to 0 after a mix; boosting over 0 saturates.
- **Effects:** short doses with safe limits (`FX_LIMITS` in profe.js): echo on
  phrase ends / echo out, reverb in breakdowns, flanger / filter rise / roll /
  trans only in the build-up into a drop.
- **Beginner UX:** one click on a highlighted control glides it to its target,
  Space applies the whole step; the layout must fit a laptop screen without zooming.
  Glides are musical (`glideMsFor`): a move you can hear takes ≥ 1 bar, mix steps use
  their `glide` in bars (crossfader to the centre over bars/4, filter sweep over several
  bars); only silent prep moves are quick. Moves of one step form a `group` (one click =
  the whole bass swap). A control that is gliding counts as done (the plan doesn't wait).
- **Even volume:** crossfader curve `xfCurve` is −1.5 dB per side in the middle (equal
  power dipped 3 dB mid-blend); prep matches the incoming channel fader to the outgoing
  one; the bass swaps on the incoming drop when its intro has no bass (`bassAt`), so the
  mix never has a hole; the profe meters the master (`Mixer.meter`) against the last
  bars of the track alone and lights the fix when the mix drops > 8 dB or rises > 5 dB.
- **Loops:** when the outgoing track runs out of music before the mix ends (or with no
  next track), the profe lights LOOP 8 = `loopFromBar` (2 bars, starts on a bar, inside
  `musicEnd`); AUTO does it by itself. FX level has safe presets (from `FX_LIMITS`) + wheel.
- **Problems light up too:** every warning in "TU MEZCLA" lights (amber) the
  control that fixes it, with its target; green lights are the mix plan's steps.
  The most important tip always wins (similar-priority tips don't flip-flop).
- **Guided mix = the user does everything:** a preparation phase starts as soon
  as the next track is loaded (crossfader side, cue point, tempo, EQ, choose the
  end effect), one lit step at a time; then PLAY lights up and is quantized to
  the bar (early/late presses land exactly on the beat). Any track loaded into
  the free deck arms it (`deck.freshLoad`), even if it played earlier. Once the
  preparation is done PLAY is available right away ("entra cuando quieras"); the
  ideal moment is only a recommendation with a countdown. Nothing moves by itself
  in guided mode; AUTO mode does the same steps by itself.
- **Guided order:** the moves of the step that starts the new track (crossfader…) only
  light after it's playing (`afterStart`). ECHO OUT (tempos > 6% apart): ECHO ON + the
  old track's LOW −26 first, then PLAY, then the crossfader. Auto-scroll to lit controls
  is only for the plan's steps (never for optional pad suggestions: the page jumped).
- **Guided = nothing moves by itself, even at the end:** `finishAutoMix` only resets the
  paused deck; in guided mode the crossfader and the new track's knobs stay where the user
  left them (after an early skip they're lit as `extraTargets`). AUTO still tidies up.
- **Transition FX/loops in the plan:** blend/filter with the drop at the end add optional
  (`optional`, expire via `until`, never hold the plan) pad steps: SUBIDA ending on the
  drop and IMPACTO on it, scheduled on the mix clock. Echo out starts with LOOP 4 on the
  old track (bar-aligned), then ECHO + LOW −26, then PLAY, then the crossfader.
- **Short intros:** when the incoming intro is shorter than the mix, the plan loops it
  (`introLoop`, 2 or 1 bars, ≤ 4 repeats) so its drop still lands at the end; releasing
  it re-syncs the plan clock to the real drop (`inLoopOut`).
- **Sampler timing:** manual pads snap to the nearest beat of what you HEAR
  (`audioLatency()`: Bluetooth is late), to the "1" if within half a beat; pressed late →
  next beat. Never wait a whole bar (the user heard IMPACTO as out of time).
- **Mix map:** while a mix is armed, `mixMap` draws it on the waveforms (green zone +
  ENTRA / BAJOS / FX / TODO AL / PAUSA on the outgoing deck, ENTRA AQUÍ on the incoming),
  the phrase line counts down to the next mark, and `#xf-plan` shows where the plan
  wants the crossfader now (`planCrossfader`).
- **BPM sanity:** only 60–200 BPM; ×2/½ can't go outside it, saved tracks out of range are fixed on load.
- **Beat FX are post-crossfader** (like a DJM): echo/reverb trails survive a cut.
- **Guided mode waits for the user:** the plan's clock stops while something is
  lit up (only the incoming track's start is automatic, it must be on the beat).
  Never stop a deck by surprise in guided mode: the user pauses the old deck
  (its PLAY button lights up "PAUSA"). Keep animations calm and avoid repeating
  the same message in a toast and in the profe bar (the user got dizzy).
