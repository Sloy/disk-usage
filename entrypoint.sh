#!/bin/sh
echo "=== Disk Usage Visualizer ==="
echo "Rescan interval: ${SCAN_INTERVAL:-1d}"

# Daily-by-default cron expression from SCAN_INTERVAL.
CRON_EXPR=$(python3 -c "
i='${SCAN_INTERVAL:-1d}'; n=i[:-1]; u=i[-1]
print('0 3 * * *' if i=='1d' else (f'0 */{n} * * *' if u=='h' else (f'*/{n} * * * *' if u=='m' else '0 3 * * *')))
")
echo "$CRON_EXPR . /app/scan.env; python3 /app/scan_all.py /app/www >> /proc/1/fd/1 2>&1" > /etc/cron.d/disk-scan
chmod 0644 /etc/cron.d/disk-scan
crontab /etc/cron.d/disk-scan

# Persist SCAN_* env for cron (cron runs with a bare environment).
# Quote values so disk names/paths with spaces survive `. /app/scan.env`.
env | grep -E '^SCAN_(PATH|NAME)' \
  | sed -E 's/^([^=]+)=(.*)$/export \1="\2"/' > /app/scan.env

cron
# Server does the initial scan in the background; startup is not blocked.
python3 /app/server.py
