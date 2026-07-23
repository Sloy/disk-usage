# tests/test_roots.py
import unittest
from roots import Root, parse_roots, data_filename


class TestParseRoots(unittest.TestCase):
    def test_numbered_env(self):
        env = {
            "SCAN_PATH_1": "/mnt/a", "SCAN_NAME_1": "Alpha",
            "SCAN_PATH_2": "/mnt/b", "SCAN_NAME_2": "Beta",
        }
        self.assertEqual(
            parse_roots(env),
            [Root(1, "Alpha", "/mnt/a"), Root(2, "Beta", "/mnt/b")],
        )

    def test_numbered_stops_at_gap(self):
        env = {"SCAN_PATH_1": "/mnt/a", "SCAN_PATH_3": "/mnt/c"}
        self.assertEqual([r.id for r in parse_roots(env)], [1])

    def test_numbered_name_defaults_to_basename(self):
        env = {"SCAN_PATH_1": "/mnt/storage"}
        self.assertEqual(parse_roots(env)[0].name, "storage")

    def test_legacy_single_root(self):
        env = {"SCAN_PATH": "/data", "SCAN_NAME": "Storage"}
        self.assertEqual(parse_roots(env), [Root(1, "Storage", "/data")])

    def test_empty_env_default(self):
        self.assertEqual(parse_roots({}), [Root(1, "Storage", "/data")])

    def test_data_filename(self):
        self.assertEqual(data_filename(2), "data-2.json")


if __name__ == "__main__":
    unittest.main()
