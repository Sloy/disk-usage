# tests/test_scan.py
import json
import os
import tempfile
import unittest
from scan import scan_to_file


class TestScanToFile(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()

    def test_writes_named_tree_with_sizes(self):
        os.makedirs(os.path.join(self.tmp, "sub"))
        with open(os.path.join(self.tmp, "sub", "f.bin"), "wb") as f:
            f.write(b"x" * 100)
        out = os.path.join(self.tmp, "data-1.json")

        tree = scan_to_file(self.tmp, out, "MyDisk")

        self.assertEqual(tree["name"], "MyDisk")
        self.assertGreaterEqual(tree["size"], 100)
        self.assertIn("totalCapacity", tree)
        self.assertIn("freeSpace", tree)
        with open(out) as f:
            self.assertEqual(json.load(f)["name"], "MyDisk")

    def test_name_is_not_read_from_env(self):
        os.environ["SCAN_NAME"] = "FromEnv"
        try:
            out = os.path.join(self.tmp, "d.json")
            tree = scan_to_file(self.tmp, out, "Explicit")
            self.assertEqual(tree["name"], "Explicit")
        finally:
            del os.environ["SCAN_NAME"]


if __name__ == "__main__":
    unittest.main()
