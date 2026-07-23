# roots.py
"""Parse numbered-env root configuration for the disk usage app."""
from __future__ import annotations  # PEP 604 `str | None` on Python 3.9 (Debian 11 LXC)
import os
from dataclasses import dataclass
from typing import Mapping


@dataclass(frozen=True)
class Root:
    id: int
    name: str
    path: str


def data_filename(root_id: int) -> str:
    return f"data-{root_id}.json"


def _name_for(path: str, explicit: str | None) -> str:
    if explicit:
        return explicit
    return os.path.basename(path.rstrip("/")) or path


def parse_roots(environ: Mapping[str, str]) -> list[Root]:
    roots: list[Root] = []
    if environ.get("SCAN_PATH_1"):
        n = 1
        while True:
            path = environ.get(f"SCAN_PATH_{n}")
            if not path:
                break
            name = _name_for(path, environ.get(f"SCAN_NAME_{n}"))
            roots.append(Root(n, name, path))
            n += 1
        return roots
    path = environ.get("SCAN_PATH", "/data")
    name = _name_for(path, environ.get("SCAN_NAME") or "Storage")
    return [Root(1, name, path)]
