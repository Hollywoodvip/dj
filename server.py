#!/usr/bin/env python3
"""WebDJ Pro local server.

Serves the DJ app and exposes a YouTube audio extractor backed by yt-dlp:

    GET /api/status                      -> {"ok": true, "ffmpeg": bool}
    GET /api/convert?url=<youtube url>   -> audio bytes (m4a/webm) for the decks
    GET /api/convert?url=...&format=mp3&download=1
    POST /api/history {tracks, mixes}    -> saves historial/ and publishes it on the
                                            repo's `historial` branch (no audio)
                                         -> 320 kbps MP3 file (requires ffmpeg)

Run:  pip install -r requirements.txt && python server.py
Then open http://localhost:8000

Only download content you own or have permission to use.
"""

import argparse
import json
import mimetypes
import os
import re
import shutil
import subprocess
import sys
import time
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
# yt-dlp needs an external JavaScript runtime to unlock YouTube's audio streams
HAS_JS_RUNTIME = any(shutil.which(r) for r in ("deno", "node", "bun", "qjs"))
ANSI_ESCAPE = re.compile(r"\x1b\[[0-9;]*m")


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
        "no_color": True,
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
        message = ANSI_ESCAPE.sub("", str(e)).replace("ERROR: ", "").strip()
        if "403" in message:
            message += (
                " | YouTube blocked the download. Fix: update yt-dlp"
                ' (pip install -U "yt-dlp[default]") and install Deno (brew install deno),'
                " then restart server.py."
            )
        raise ConvertError(f"Download failed: {message}", 502)

    files = [f for f in os.listdir(workdir) if f.startswith("audio.")]
    if not files:
        raise ConvertError("Download failed: no audio was produced (too long or too big?).", 502)
    return os.path.join(workdir, files[0]), info


def app_version():
    """Last commit (hash + date) so the page can show which version is running."""
    try:
        out = subprocess.run(
            ["git", "-C", ROOT, "log", "-1", "--format=%h · %cd", "--date=format:%d/%m %H:%M"],
            capture_output=True, text=True, timeout=3,
        )
        if out.returncode == 0 and out.stdout.strip():
            return out.stdout.strip()
    except (OSError, subprocess.SubprocessError):
        pass
    newest = max(os.path.getmtime(os.path.join(ROOT, "js", f)) for f in os.listdir(os.path.join(ROOT, "js")))
    return time.strftime("%d/%m %H:%M", time.localtime(newest))


HISTORY_DIR = os.path.join(ROOT, "historial")
HISTORY_BRANCH = "historial"


def _git(*args, env=None, input_text=None, timeout=60):
    return subprocess.run(["git", "-C", ROOT, *args], capture_output=True, text=True,
                          input=input_text, timeout=timeout, env=env)


def merge_history(tracks, mixes):
    """Merge what the browser sent with what was saved before (clearing the library
    in the browser must not erase the history)."""
    os.makedirs(HISTORY_DIR, exist_ok=True)

    def load(name):
        try:
            with open(os.path.join(HISTORY_DIR, name), encoding="utf-8") as f:
                return json.load(f)
        except (OSError, ValueError):
            return []

    def track_key(t):
        return (t.get("url") or "").strip() or f"{t.get('artist', '')} - {t.get('title', '')}".strip().lower()

    merged = {track_key(t): t for t in load("tracks.json") if isinstance(t, dict)}
    for t in tracks:
        if isinstance(t, dict):
            merged[track_key(t)] = t
    all_tracks = sorted(merged.values(), key=lambda t: (t.get("artist") or "", t.get("title") or ""))

    seen = {}
    for m in load("mixes.json") + [m for m in mixes if isinstance(m, dict)]:
        key = f"{m.get('at')}|{(m.get('out') or {}).get('title')}|{(m.get('in') or {}).get('title')}"
        seen[key] = m  # the newer copy wins (it may carry your 👍/👎)
    all_mixes = sorted(seen.values(), key=lambda m: m.get("at") or "")

    rated = [m for m in all_mixes if m.get("rating")]
    readme = (
        "# Historial de WebDJ\n\n"
        "Datos de las sesiones reales (sin audio), para mejorar el análisis y el DJ PROFE.\n\n"
        f"- `tracks.json`: {len(all_tracks)} temas — análisis (BPM, tono, drop, breaks, energía por compás) "
        "y correcciones del usuario (`bpmDetected` vs `bpm`, hot cues).\n"
        f"- `mixes.json`: {len(all_mixes)} mezclas — plan del profe, cuándo entró el usuario, nivel de volumen, "
        f"resultado y calificación ({sum(1 for m in rated if m['rating'] == 'good')} 👍 / "
        f"{sum(1 for m in rated if m['rating'] == 'bad')} 👎).\n"
        f"\nActualizado: {time.strftime('%Y-%m-%d %H:%M')}\n"
    )
    for name, data in (("tracks.json", all_tracks), ("mixes.json", all_mixes)):
        with open(os.path.join(HISTORY_DIR, name), "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=1)
    with open(os.path.join(HISTORY_DIR, "README.md"), "w", encoding="utf-8") as f:
        f.write(readme)
    return len(all_tracks), len(all_mixes)


def publish_history():
    """Commit historial/ onto its own branch WITHOUT touching the branch you work on
    (git plumbing: no checkout, no change to HEAD, so `git pull` keeps working)."""
    env = dict(os.environ, GIT_TERMINAL_PROMPT="0",
               GIT_AUTHOR_NAME=os.environ.get("GIT_AUTHOR_NAME", "WebDJ"),
               GIT_AUTHOR_EMAIL=os.environ.get("GIT_AUTHOR_EMAIL", "webdj@localhost"),
               GIT_COMMITTER_NAME=os.environ.get("GIT_COMMITTER_NAME", "WebDJ"),
               GIT_COMMITTER_EMAIL=os.environ.get("GIT_COMMITTER_EMAIL", "webdj@localhost"))
    try:
        entries = []
        for name in sorted(os.listdir(HISTORY_DIR)):
            path = os.path.join(HISTORY_DIR, name)
            if not os.path.isfile(path):
                continue
            blob = _git("hash-object", "-w", path, env=env)
            if blob.returncode != 0:
                return False, blob.stderr.strip()[-200:]
            entries.append(f"100644 blob {blob.stdout.strip()}\t{name}")
        tree = _git("mktree", env=env, input_text="\n".join(entries) + "\n")
        if tree.returncode != 0:
            return False, tree.stderr.strip()[-200:]
        tree_id = tree.stdout.strip()
        parent = None
        fetched = _git("fetch", "--quiet", "origin", f"{HISTORY_BRANCH}:refs/remotes/origin/{HISTORY_BRANCH}", env=env)
        if fetched.returncode == 0:
            head = _git("rev-parse", f"refs/remotes/origin/{HISTORY_BRANCH}", env=env)
            if head.returncode == 0:
                parent = head.stdout.strip()
                same = _git("rev-parse", f"{parent}^{{tree}}", env=env)
                if same.returncode == 0 and same.stdout.strip() == tree_id:
                    return True, "sin cambios desde la última vez"
        args = ["commit-tree", tree_id, "-m", f"Historial {time.strftime('%Y-%m-%d %H:%M')}"]
        if parent:
            args[2:2] = ["-p", parent]
        commit = _git(*args, env=env)
        if commit.returncode != 0:
            return False, commit.stderr.strip()[-200:]
        push = _git("push", "--quiet", "origin", f"{commit.stdout.strip()}:refs/heads/{HISTORY_BRANCH}", env=env, timeout=120)
        if push.returncode != 0:
            err = push.stderr.strip()
            hint = "sin permiso para subir a GitHub desde esta terminal" if ("403" in err or "Authentication" in err or "could not read" in err) else err[-200:]
            return False, hint
        return True, "ok"
    except (OSError, subprocess.SubprocessError) as e:
        return False, str(e)


SCRIPT_TAG = re.compile(r'src="(js/[\w.-]+\.js)"')


class DJHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def end_headers(self):
        # Always revalidate the app files so a `git pull` is picked up on reload
        if not self.path.startswith("/api/"):
            self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/api/status":
            return self.send_json(200, {"ok": True, "ytdlp": yt_dlp is not None, "ffmpeg": HAS_FFMPEG, "version": app_version()})
        if parsed.path in ("/", "/index.html"):
            return self.send_index()
        if parsed.path == "/api/convert":
            return self.handle_convert(urllib.parse.parse_qs(parsed.query))
        return super().do_GET()

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/api/mp3":
            return self.handle_mp3(urllib.parse.parse_qs(parsed.query))
        if parsed.path == "/api/history":
            return self.handle_history()
        return self.send_json(404, {"error": "Not found"})

    def handle_history(self):
        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0 or length > 50 * 1024 * 1024:
            return self.send_json(400, {"error": "Historial vacío o demasiado grande"})
        try:
            data = json.loads(self.rfile.read(length).decode("utf-8"))
        except (ValueError, UnicodeDecodeError):
            return self.send_json(400, {"error": "Historial inválido"})
        tracks, mixes = merge_history(data.get("tracks") or [], data.get("mixes") or [])
        pushed, message = publish_history()
        print(f"Historial: {tracks} temas, {mixes} mezclas -> {'rama historial en GitHub' if pushed else 'solo local: ' + message}")
        return self.send_json(200, {"ok": True, "tracks": tracks, "mixes": mixes, "pushed": pushed, "message": message})

    def handle_mp3(self, query):
        """Convert a recorded mix (webm/m4a from the browser) to a 320 kbps MP3."""
        if not HAS_FFMPEG:
            return self.send_json(500, {"error": "ffmpeg no está instalado (brew install ffmpeg)"})
        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0 or length > 2 * 1024 * 1024 * 1024:
            return self.send_json(400, {"error": "Grabación vacía o demasiado grande"})
        name = (query.get("name") or ["WebDJ mezcla"])[0]
        workdir = tempfile.mkdtemp(prefix="webdj-rec-")
        try:
            src = os.path.join(workdir, "mix.input")
            dst = os.path.join(workdir, "mix.mp3")
            remaining = length
            with open(src, "wb") as f:
                while remaining > 0:
                    chunk = self.rfile.read(min(1 << 20, remaining))
                    if not chunk:
                        break
                    f.write(chunk)
                    remaining -= len(chunk)
            result = subprocess.run(
                ["ffmpeg", "-y", "-loglevel", "error", "-i", src, "-codec:a", "libmp3lame", "-b:a", "320k", dst],
                capture_output=True, text=True, timeout=1800,
            )
            if result.returncode != 0 or not os.path.exists(dst):
                return self.send_json(500, {"error": f"ffmpeg falló: {result.stderr.strip()[-300:]}"})
            safe = "".join(c for c in name if c not in '\\/:*?"<>|').strip() or "WebDJ mezcla"
            self.send_response(200)
            self.send_header("Content-Type", "audio/mpeg")
            self.send_header("Content-Length", str(os.path.getsize(dst)))
            self.send_header("Content-Disposition", f"attachment; filename*=UTF-8''{urllib.parse.quote(safe)}.mp3")
            self.end_headers()
            with open(dst, "rb") as f:
                shutil.copyfileobj(f, self.wfile)
        except subprocess.TimeoutExpired:
            self.send_json(500, {"error": "La conversión tardó demasiado"})
        except (BrokenPipeError, ConnectionResetError):
            pass
        finally:
            shutil.rmtree(workdir, ignore_errors=True)

    def send_index(self):
        # Stamp every script with its modification time: after a `git pull` the
        # browser has to load the new files instead of a cached copy
        with open(os.path.join(ROOT, "index.html"), encoding="utf-8") as f:
            html = f.read()

        def stamp(match):
            path = os.path.join(ROOT, match.group(1))
            mtime = int(os.path.getmtime(path)) if os.path.exists(path) else 0
            return f'src="{match.group(1)}?v={mtime}"'

        body = SCRIPT_TAG.sub(stamp, html).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

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
    else:
        print(f"yt-dlp {yt_dlp.version.__version__}")
    if sys.version_info < (3, 10):
        print("WARNING: Python 3.9 is too old for current yt-dlp versions. Install Python 3.10+")
        print("         (macOS: brew install python) and recreate the .venv.")
    if not HAS_JS_RUNTIME:
        print("WARNING: no JavaScript runtime found. YouTube downloads will likely fail with 403.")
        print("         Install Deno (macOS: brew install deno) and restart.")
    if not HAS_FFMPEG:
        print("NOTE: ffmpeg not found. Decks work fine, but 'Download MP3' is disabled.")

    try:
        server = ThreadingHTTPServer((args.host, args.port), DJHandler)
    except OSError as e:
        if e.errno in (48, 98):  # macOS / Linux "address already in use"
            print(f"Port {args.port} is already in use: server.py is probably already running in another")
            print(f"terminal (just open http://localhost:{args.port}), or use --port {args.port + 1}.")
            sys.exit(1)
        raise
    shown = "localhost" if args.host in ("127.0.0.1", "0.0.0.0") else args.host
    print(f"WebDJ Pro (version {app_version()}) running at http://{shown}:{args.port}  (Ctrl+C to stop)")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
