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


import roots as roots_mod
from scan_all import scan_all


class TestScanAll(unittest.TestCase):
    def test_scans_each_root_into_own_file(self):
        base = tempfile.mkdtemp()
        a = os.path.join(base, "a"); os.makedirs(a)
        b = os.path.join(base, "b"); os.makedirs(b)
        open(os.path.join(a, "x"), "wb").write(b"y" * 10)
        www = os.path.join(base, "www"); os.makedirs(www)
        env = {"SCAN_PATH_1": a, "SCAN_NAME_1": "Aye",
               "SCAN_PATH_2": b, "SCAN_NAME_2": "Bee"}

        scan_all(env, www)

        with open(os.path.join(www, "data-1.json")) as f:
            self.assertEqual(json.load(f)["name"], "Aye")
        with open(os.path.join(www, "data-2.json")) as f:
            self.assertEqual(json.load(f)["name"], "Bee")


if __name__ == "__main__":
    unittest.main()
