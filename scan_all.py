#!/usr/bin/env python3
"""Scan every configured root into its own data-<id>.json."""
import os
import sys

from roots import parse_roots, data_filename
from scan import scan_to_file


def scan_all(environ, www_dir):
    for root in parse_roots(environ):
        out = os.path.join(www_dir, data_filename(root.id))
        try:
            scan_to_file(root.path, out, root.name)
        except Exception as e:  # noqa: BLE001 - one bad root must not stop others
            print(f"Scan failed for root {root.id} ({root.path}): {e}", flush=True)


def _default_www():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    return "/app/www" if os.path.exists("/app/www") else os.path.join(script_dir, "www")


if __name__ == "__main__":
    www = sys.argv[1] if len(sys.argv) > 1 else _default_www()
    scan_all(os.environ, www)
