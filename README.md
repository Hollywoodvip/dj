# WebDJ Pro

Two-deck DJ app in the browser (Web Audio API): pitch, sync, brake, hot cues,
loops, 3-band EQ, filter, crossfader, BPM detection — plus a YouTube audio
extractor powered by [yt-dlp](https://github.com/yt-dlp/yt-dlp).

## Run it

Needs Python 3.9+.

```bash
pip install -r requirements.txt
python server.py
```

Open **http://localhost:8000**, click **Start Audio Engine**, paste a YouTube
link and press **Extract Audio**. When it finishes, send the track to Deck A or B.

- **MP3 download** (320 kbps) needs [ffmpeg](https://ffmpeg.org/download.html)
  installed and on your PATH. Without it the decks work the same, and the
  download button gives you the original M4A.
- To use it from your phone on the same Wi-Fi: `python server.py --host 0.0.0.0`
  and open `http://<your-computer-ip>:8000`.
- If YouTube downloads start failing, update yt-dlp: `pip install -U yt-dlp`.
- Opening `index.html` directly works for local files and the demo beats, but
  the YouTube converter needs `server.py`.

Only download content you own or have permission to use.
