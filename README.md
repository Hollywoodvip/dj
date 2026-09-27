# WebDJ Pro

Two-deck DJ app in the browser (Web Audio API) with a YouTube audio extractor
powered by [yt-dlp](https://github.com/yt-dlp/yt-dlp).

**Decks:** pitch (±8/±16%), SYNC with beat-phase alignment, hot cues, beat-quantized
loops, CUE with hold-to-preview, jog wheel (pitch bend / scrub), BRAKE and SPINBACK,
Rekordbox-style 3-band waveforms with beat grid, bar/beat counter.

**Beat FX (per deck):** ECHO, REVERB, FLANGER, PHASER, TRANS, ROLL (with slip),
synced to the track tempo (1/4 – 4 beats), level/depth, tap = latch, hold = momentary.

**Mix coach:** for every transition it builds a plan — BLEND with EQ (bass swap),
FILTER SWEEP (for clashing keys) or ECHO OUT (for tempos too far apart, the next track
drops in on its drop) — with the exact start point, where the next track starts and
each step bar by bar (which knob, to what value, which effect). **AUTO MIX** plays the
plan by itself; **GUIDED** (T) lights up the controls you have to move so you learn.
Tracks are auto-levelled (gain) so loud and quiet songs mix evenly.

**Mix assistant:** every track is analysed for BPM + beat grid, downbeats, musical key
(Camelot), intro / breakdowns / outro and 8-bar phrases. It recommends where to mix
out and in, how long, and warns about tempo or key clashes.
**AUTO MIX** does the transition for you (tempo sync, starts the next track on the
phrase, crossfade, bass swap). **AUTO DJ** keeps mixing through your library,
picking the best-matching track next.

**Also:** sampler pads (air horn, siren, riser, laser), library with match stars,
keyboard shortcuts for everything (press **H** in the app).

## Run it

Needs **Python 3.10+** and **[Deno](https://deno.com)** (yt-dlp uses it to unlock
YouTube's audio streams; without it downloads fail with `HTTP Error 403`).

On macOS with [Homebrew](https://brew.sh):

```bash
brew install python deno ffmpeg   # ffmpeg is optional (MP3 export)
```

Then (on macOS use `python3`; plain `python`/`pip` only exist inside the venv):

```bash
cd dj
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python server.py
```

Next time you only need `cd dj && source .venv/bin/activate && python server.py`.

Open **http://localhost:8000**, click **Start Audio Engine**, paste a YouTube
link and press **Extract Audio**. When it finishes, send the track to Deck A or B.

- **MP3 download** (320 kbps) needs [ffmpeg](https://ffmpeg.org/download.html)
  installed and on your PATH. Without it the decks work the same, and the
  download button gives you the original M4A.
- To use it from your phone on the same Wi-Fi: `python server.py --host 0.0.0.0`
  and open `http://<your-computer-ip>:8000`.
- If YouTube downloads start failing (403), update yt-dlp: `pip install -U "yt-dlp[default]"`
  and make sure Deno is installed.
- `Port 8000 is already in use` means the server is already running in another terminal.
- Opening `index.html` directly works for local files and the demo beats, but
  the YouTube converter needs `server.py`.

Only download content you own or have permission to use.

## Keyboard (press H in the app for the full list)

| Deck A | Deck B | Action |
|---|---|---|
| S | L | Play / pause |
| A | ; (Ñ) | Cue (hold = preview) |
| D | K | Sync |
| Z / X | / (-) / . | Nudge slower / faster (Shift = pitch ±0.1%) |
| Q W E R | U I O P | Loop 1 / 2 / 4 / 8 beats |
| 1 2 3 | 8 9 0 | Hot cues (Shift = delete) |
| F | J | FX on (tap = latch, hold = momentary) |
| C | , | Next effect |
| V | M | Brake (Shift = spinback) |

Global: ← → crossfader · ↓ center · Enter = AUTO MIX · Shift+Enter = MIX NOW · T = guided mix ·
G = prepare next deck · 4–7 = sampler · Esc = cancel · H = help.
