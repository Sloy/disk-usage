#!/usr/bin/env python3
"""Scan a directory and output a JSON tree of file/folder sizes."""

import json
import os
import sys
import shutil


def scan_dir(path):
    """Recursively scan directory and return a tree structure."""
    result = {
        "name": os.path.basename(path) or path,
        "size": 0,
        "children": []
    }

    try:
        entries = sorted(os.listdir(path))
    except PermissionError:
        return result

    for entry in entries:
        if entry.startswith('.'):
            continue
        full_path = os.path.join(path, entry)
        try:
            if os.path.isdir(full_path) and not os.path.islink(full_path):
                child = scan_dir(full_path)
                if child["size"] > 0:
                    result["children"].append(child)
                    result["size"] += child["size"]
            elif os.path.isfile(full_path):
                file_size = os.path.getsize(full_path)
                result["children"].append({
                    "name": entry,
                    "size": file_size
                })
                result["size"] += file_size
        except (PermissionError, OSError):
            continue

    # Sort children by size descending
    result["children"].sort(key=lambda x: x["size"], reverse=True)

    return result


def scan_to_file(scan_path, output_path, display_name):
    """Scan scan_path, write the JSON tree to output_path, return the tree."""
    print(f"Scanning {scan_path} as '{display_name}'...", flush=True)
    tree = scan_dir(scan_path)
    tree["name"] = display_name
    usage = shutil.disk_usage(scan_path)
    tree["totalCapacity"] = usage.total
    tree["freeSpace"] = usage.free
    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
    with open(output_path, "w") as f:
        json.dump(tree, f)
    print(f"Done. {tree['size'] / (1024**3):.1f} GB -> {output_path}", flush=True)
    return tree


def main():
    scan_path = sys.argv[1] if len(sys.argv) > 1 else "/mnt/storage"
    script_dir = os.path.dirname(os.path.abspath(__file__))
    default_output = (
        "/app/www/data-1.json" if os.path.exists("/app/www")
        else os.path.join(script_dir, "www", "data-1.json")
    )
    output_path = sys.argv[2] if len(sys.argv) > 2 else default_output
    display_name = (
        sys.argv[3] if len(sys.argv) > 3
        else os.environ.get("SCAN_NAME") or os.path.basename(scan_path.rstrip("/")) or "Storage"
    )
    scan_to_file(scan_path, output_path, display_name)


if __name__ == "__main__":
    main()
