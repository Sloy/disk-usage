# tests/test_server.py
import json
import os
import tempfile
import threading
import time
import unittest
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer

import server


def _get(url):
    with urllib.request.urlopen(url, timeout=5) as r:
        return r.status, json.load(r)


def _post(url, payload):
    data = json.dumps(payload).encode()
    req = urllib.request.Request(url, data=data, method="POST",
                                 headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=5) as r:
            return r.status, json.load(r)
    except urllib.error.HTTPError as e:  # 409 already_scanning is a valid response
        return e.code, json.load(e)


class TestServerApi(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.www = tempfile.mkdtemp()
        # Small real dir so a triggered rescan is fast (not /tmp).
        cls.scan_dir = tempfile.mkdtemp()
        with open(os.path.join(cls.scan_dir, "f.bin"), "wb") as f:
            f.write(b"z" * 50)
        # Pre-seed root 1 data so startup scan is a no-op for it.
        with open(os.path.join(cls.www, "data-1.json"), "w") as f:
            json.dump({"name": "Alpha", "size": 1, "children": []}, f)
        server.configure(
            environ={"SCAN_PATH_1": cls.scan_dir, "SCAN_NAME_1": "Alpha"},
            www_dir=cls.www,
        )
        cls.httpd = ThreadingHTTPServer(("127.0.0.1", 0), server.Handler)
        cls.port = cls.httpd.server_address[1]
        cls.t = threading.Thread(target=cls.httpd.serve_forever, daemon=True)
        cls.t.start()
        cls.base = f"http://127.0.0.1:{cls.port}"

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()

    def test_roots_lists_configured_roots(self):
        status, body = _get(self.base + "/api/roots")
        self.assertEqual(status, 200)
        self.assertEqual(body[0]["id"], 1)
        self.assertEqual(body[0]["name"], "Alpha")
        self.assertIn("last_scan", body[0])
        self.assertIn("scanning", body[0])

    def test_status_defaults_to_first_root(self):
        status, body = _get(self.base + "/api/status")
        self.assertEqual(status, 200)
        self.assertIn("scanning", body)
        self.assertIn("last_scan", body)

    def test_rescan_unknown_root_defaults_and_starts(self):
        status, body = _post(self.base + "/api/rescan", {"root": 999})
        self.assertIn(body["status"], ("started", "already_scanning"))


if __name__ == "__main__":
    unittest.main()
