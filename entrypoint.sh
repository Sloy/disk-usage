#!/bin/sh

echo "=== Disk Usage Visualizer ==="
echo "Scan path: $SCAN_PATH"
echo "Rescan interval: ${SCAN_INTERVAL:-6h}"

# Run initial scan
python3 /app/scan.py "$SCAN_PATH" /app/www/data.json

# Background rescan loop
(
  while true; do
    sleep "${SCAN_INTERVAL:-6h}"
    echo "Rescanning..."
    python3 /app/scan.py "$SCAN_PATH" /app/www/data.json
  done
) &

echo "Serving at http://0.0.0.0:8888"
cd /app/www && python3 -m http.server 8888 --bind 0.0.0.0
