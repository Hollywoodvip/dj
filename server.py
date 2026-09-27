#!/usr/bin/env python3
"""WebDJ Pro local server.

Serves the DJ app and exposes a YouTube audio extractor backed by yt-dlp:

    GET /api/status                      -> {"ok": true, "ffmpeg": bool}
    GET /api/convert?url=<youtube url>   -> audio bytes (m4a/webm) for the decks
    GET /api/convert?url=...&format=mp3&download=1
                                         -> 320 kbps MP3 file (requires ffmpeg)

Run:  pip install -r requirements.txt && python server.py
Then open http://localhost:8000

Only download content you own or have permission to use.
"""

import argparse
import json
import mimetypes
import os
import shutil
import tempfile
import urllib.parse
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

try:
    import yt_dlp
except ImportError:  # pragma: no cover - reported to the user at runtime
    yt_dlp = None

ROOT = os.path.dirname(os.path.abspath(__file__))
ALLOWED_HOSTS = {
    "youtube.com",
    "www.youtube.com",
    "m.youtube.com",
    "music.youtube.com",
    "youtu.be",
}
MAX_DURATION_SECONDS = 30 * 60
MAX_FILESIZE_BYTES = 200 * 1024 * 1024
HAS_FFMPEG = shutil.which("ffmpeg") is not None


class ConvertError(Exception):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.status = status


def validate_url(url):
    try:
        parsed = urllib.parse.urlparse(url)
    except ValueError:
        raise ConvertError("Invalid URL.")
    if parsed.scheme not in ("http", "https") or parsed.hostname not in ALLOWED_HOSTS:
        raise ConvertError("Only YouTube links are supported.")
    return url


def download_audio(url, workdir, as_mp3=False):
    """Download the best audio stream into workdir. Returns (path, info)."""
    if yt_dlp is None:
        raise ConvertError("yt-dlp is not installed. Run: pip install -r requirements.txt", 500)
    if as_mp3 and not HAS_FFMPEG:
        raise ConvertError("MP3 export needs ffmpeg installed on this computer.", 500)

    def check_duration(info, *, incomplete):
        duration = info.get("duration")
        if duration and duration > MAX_DURATION_SECONDS:
            return f"Video is longer than {MAX_DURATION_SECONDS // 60} minutes."
        return None

    opts = {
        # m4a first: decodes in every browser (Safari can't decode webm/opus)
        "format": "bestaudio[ext=m4a]/bestaudio/best",
        "outtmpl": os.path.join(workdir, "audio.%(ext)s"),
        "noplaylist": True,
        "quiet": True,
        "no_warnings": True,
        "max_filesize": MAX_FILESIZE_BYTES,
        "match_filter": check_duration,
    }
    if as_mp3:
        opts["postprocessors"] = [
            {"key": "FFmpegExtractAudio", "preferredcodec": "mp3", "preferredquality": "320"}
        ]

    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(url, download=True)
    except yt_dlp.utils.DownloadError as e:
        raise ConvertError(f"Download failed: {str(e).replace('ERROR: ', '')}", 502)

    files = [f for f in os.listdir(workdir) if f.startswith("audio.")]
    if not files:
        raise ConvertError("Download failed: no audio was produced (too long or too big?).", 502)
    return os.path.join(workdir, files[0]), info


class DJHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/api/status":
            return self.send_json(200, {"ok": True, "ytdlp": yt_dlp is not None, "ffmpeg": HAS_FFMPEG})
        if parsed.path == "/api/convert":
            return self.handle_convert(urllib.parse.parse_qs(parsed.query))
        return super().do_GET()

    def handle_convert(self, query):
        url = (query.get("url") or [""])[0].strip()
        as_mp3 = (query.get("format") or [""])[0] == "mp3"
        as_download = (query.get("download") or [""])[0] == "1"

        workdir = tempfile.mkdtemp(prefix="webdj-")
        try:
            validate_url(url)
            path, info = download_audio(url, workdir, as_mp3=as_mp3)
            title = info.get("track") or info.get("title") or "YouTube Track"
            artist = info.get("artist") or info.get("uploader") or info.get("channel") or ""
            ext = os.path.splitext(path)[1]
            content_type = mimetypes.guess_type(path)[0] or "application/octet-stream"
            if ext == ".m4a":
                content_type = "audio/mp4"

            self.send_response(200)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(os.path.getsize(path)))
            self.send_header("X-Track-Title", urllib.parse.quote(title))
            self.send_header("X-Track-Artist", urllib.parse.quote(artist))
            self.send_header("Cache-Control", "no-store")
            if as_download:
                safe = "".join(c for c in f"{artist} - {title}" if c not in '\\/:*?"<>|').strip(" -")
                filename = urllib.parse.quote(f"{safe or 'track'}{ext}")
                self.send_header("Content-Disposition", f"attachment; filename*=UTF-8''{filename}")
            self.end_headers()
            with open(path, "rb") as f:
                shutil.copyfileobj(f, self.wfile)
        except ConvertError as e:
            self.send_json(e.status, {"error": str(e)})
        except (BrokenPipeError, ConnectionResetError):
            pass
        finally:
            shutil.rmtree(workdir, ignore_errors=True)

    def send_json(self, status, payload):
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def main():
    parser = argparse.ArgumentParser(description="WebDJ Pro local server")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--host", default="127.0.0.1", help="use 0.0.0.0 to open it from other devices on your network")
    args = parser.parse_args()

    if yt_dlp is None:
        print("WARNING: yt-dlp not installed, the YouTube converter will not work.")
        print("         Run: pip install -r requirements.txt")
    if not HAS_FFMPEG:
        print("NOTE: ffmpeg not found. Decks work fine, but 'Download MP3' is disabled.")

    server = ThreadingHTTPServer((args.host, args.port), DJHandler)
    shown = "localhost" if args.host in ("127.0.0.1", "0.0.0.0") else args.host
    print(f"WebDJ Pro running at http://{shown}:{args.port}  (Ctrl+C to stop)")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
