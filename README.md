# WebDJ Pro

Two-deck DJ app in the browser (Web Audio API): pitch, sync, brake, hot cues,
loops, 3-band EQ, filter, crossfader, BPM detection — plus a YouTube audio
extractor powered by [yt-dlp](https://github.com/yt-dlp/yt-dlp).

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
