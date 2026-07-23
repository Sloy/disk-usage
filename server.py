#!/usr/bin/env python3
"""Threading HTTP server: serves the UI and per-root scan APIs."""
import http.server
import json
import os
import shutil
import threading
import time
from urllib.parse import urlparse, parse_qs

from roots import parse_roots, data_filename
from scan import scan_to_file

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
WWW_DIR = "/app/www" if os.path.exists("/app/www") else os.path.join(SCRIPT_DIR, "www")

# Populated by configure().
ROOTS = []
ROOT_BY_ID = {}
_scan_lock = threading.Lock()
_scanning = {}  # root_id -> bool


def configure(environ=None, www_dir=None):
    global WWW_DIR, ROOTS, ROOT_BY_ID
    if www_dir is not None:
        WWW_DIR = www_dir
    ROOTS = parse_roots(environ if environ is not None else os.environ)
    ROOT_BY_ID = {r.id: r for r in ROOTS}


def _data_path(root_id):
    return os.path.join(WWW_DIR, data_filename(root_id))


def _last_scan(root_id):
    p = _data_path(root_id)
    return os.path.getmtime(p) if os.path.exists(p) else None


def _resolve_root(root_id):
    return ROOT_BY_ID.get(root_id, ROOTS[0] if ROOTS else None)


def run_scan(root):
    with _scan_lock:
        if _scanning.get(root.id):
            return False
        _scanning[root.id] = True
    thread = threading.Thread(target=_do_scan, args=(root,), daemon=True)
    thread.start()
    return True


def _do_scan(root):
    try:
        scan_to_file(root.path, _data_path(root.id), root.name)
    except Exception as e:  # noqa: BLE001
        print(f"Scan failed for root {root.id}: {e}", flush=True)
    finally:
        with _scan_lock:
            _scanning[root.id] = False


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=WWW_DIR, **kwargs)

    # --- routing ---
    def do_POST(self):
        start = time.monotonic()
        if urlparse(self.path).path == "/api/rescan":
            self._handle_rescan()
        else:
            self.send_error(404)
        self._log_timing("POST", start)

    def do_GET(self):
        start = time.monotonic()
        path = urlparse(self.path).path
        if path == "/api/roots":
            self._handle_roots()
        elif path == "/api/status":
            self._handle_status()
        else:
            super().do_GET()
        self._log_timing("GET", start)

    # --- handlers ---
    def _handle_roots(self):
        self._send_json([
            {"id": r.id, "name": r.name,
             "last_scan": _last_scan(r.id),
             "scanning": bool(_scanning.get(r.id))}
            for r in ROOTS
        ])

    def _handle_status(self):
        qs = parse_qs(urlparse(self.path).query)
        try:
            root_id = int(qs.get("root", [0])[0] or 0)
        except ValueError:
            root_id = 0
        root = _resolve_root(root_id)
        if not root:
            self._send_json({"scanning": False, "last_scan": None})
            return
        self._send_json({"scanning": bool(_scanning.get(root.id)),
                         "last_scan": _last_scan(root.id)})

    def _handle_rescan(self):
        length = int(self.headers.get("Content-Length") or 0)
        body = self.rfile.read(length) if length else b"{}"
        try:
            root_id = int(json.loads(body or b"{}").get("root", 0))
        except (ValueError, json.JSONDecodeError):
            root_id = 0
        root = _resolve_root(root_id)
        if not root:
            self._send_json({"status": "no_roots"}, 400)
            return
        started = run_scan(root)
        self._send_json({"status": "started" if started else "already_scanning"},
                        200 if started else 409)

    # --- helpers ---
    def _send_json(self, data, code=200):
        body = json.dumps(data).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _log_timing(self, method, start):
        ms = (time.monotonic() - start) * 1000
        print(f"{method} {self.path} {ms:.0f}ms", flush=True)

    def log_message(self, *args):
        pass  # replaced by explicit timing logs


def _refresh_assets():
    """Copy code assets from source dir into WWW_DIR (always overwrite; never data)."""
    os.makedirs(os.path.join(WWW_DIR, "vendor"), exist_ok=True)
    for name in ["index.html", "app.js", "favicon.svg"]:
        src = os.path.join(SCRIPT_DIR, name)
        if os.path.exists(src):
            shutil.copy2(src, os.path.join(WWW_DIR, name))
    src_vendor = os.path.join(SCRIPT_DIR, "vendor")
    if os.path.isdir(src_vendor):
        for name in os.listdir(src_vendor):
            shutil.copy2(os.path.join(src_vendor, name),
                         os.path.join(WWW_DIR, "vendor", name))


def _startup_scan():
    for root in ROOTS:
        if not os.path.exists(_data_path(root.id)):
            run_scan(root)


if __name__ == "__main__":
    configure()
    _refresh_assets()
    threading.Thread(target=_startup_scan, daemon=True).start()
    port = int(os.environ.get("PORT", 8888))
    httpd = http.server.ThreadingHTTPServer(("0.0.0.0", port), Handler)
    print(f"Serving at http://0.0.0.0:{port}", flush=True)
    httpd.serve_forever()
