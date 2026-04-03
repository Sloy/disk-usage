#!/usr/bin/env python3
"""HTTP server that serves the web UI and handles rescan requests."""

import http.server
import json
import os
import subprocess
import threading

SCAN_PATH = os.environ.get("SCAN_PATH", "/data")
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
WWW_DIR = "/app/www" if os.path.exists("/app/www") else os.path.join(SCRIPT_DIR, "www")
DATA_FILE = os.path.join(WWW_DIR, "data.json")
SCAN_SCRIPT = os.path.join(SCRIPT_DIR, "scan.py")

scanning_lock = threading.Lock()
is_scanning = False


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=WWW_DIR, **kwargs)

    def do_POST(self):
        if self.path == "/api/rescan":
            self.handle_rescan()
        else:
            self.send_error(404)

    def do_GET(self):
        if self.path == "/api/status":
            self.handle_status()
        else:
            super().do_GET()

    def handle_rescan(self):
        global is_scanning
        if is_scanning:
            self.send_json({"status": "already_scanning"}, 409)
            return

        thread = threading.Thread(target=run_scan, daemon=True)
        thread.start()
        self.send_json({"status": "started"})

    def handle_status(self):
        mtime = None
        if os.path.exists(DATA_FILE):
            mtime = os.path.getmtime(DATA_FILE)
        self.send_json({
            "scanning": is_scanning,
            "last_scan": mtime,
        })

    def send_json(self, data, code=200):
        body = json.dumps(data).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format, *args):
        # Suppress noisy per-request logs, keep errors
        if args and "200" not in str(args[0]) and "304" not in str(args[0]):
            super().log_message(format, *args)


def run_scan():
    global is_scanning
    with scanning_lock:
        is_scanning = True
        try:
            print(f"Scanning {SCAN_PATH}...", flush=True)
            subprocess.run(
                ["python3", SCAN_SCRIPT, SCAN_PATH, DATA_FILE],
                check=True,
            )
            print("Scan complete.", flush=True)
        except subprocess.CalledProcessError as e:
            print(f"Scan failed: {e}", flush=True)
        finally:
            is_scanning = False


if __name__ == "__main__":
    # Ensure www dir has static files for local dev
    os.makedirs(WWW_DIR, exist_ok=True)
    for filename in ["index.html", "favicon.svg"]:
        src = os.path.join(SCRIPT_DIR, filename)
        dst = os.path.join(WWW_DIR, filename)
        if os.path.exists(src) and not os.path.exists(dst):
            import shutil
            shutil.copy2(src, dst)

    port = int(os.environ.get("PORT", 8888))
    server = http.server.HTTPServer(("0.0.0.0", port), Handler)
    print(f"Serving at http://0.0.0.0:{port}", flush=True)
    server.serve_forever()
