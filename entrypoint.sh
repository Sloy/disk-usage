#!/bin/sh
echo "=== Disk Usage Visualizer ==="
echo "Rescan interval: ${SCAN_INTERVAL:-1d}"

# Daily-by-default cron expression from SCAN_INTERVAL.
CRON_EXPR=$(python3 -c "
i='${SCAN_INTERVAL:-1d}'; n=i[:-1]; u=i[-1]
print('0 3 * * *' if i=='1d' else (f'0 */{n} * * *' if u=='h' else (f'*/{n} * * * *' if u=='m' else '0 3 * * *')))
")
echo "$CRON_EXPR . /app/scan.env; python3 /app/scan_all.py /app/www >> /proc/1/fd/1 2>&1" | crontab -

# Persist SCAN_* env and a full PATH for cron (cron's default PATH omits
# /usr/local/bin, where this image's python3 lives).
# Quote values so disk names/paths with spaces survive `. /app/scan.env`.
{
  echo 'export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"'
  env | grep -E '^SCAN_(PATH|NAME)' \
    | sed -E 's/^([^=]+)=(.*)$/export \1="\2"/'
} > /app/scan.env

cron
# Server does the initial scan in the background; startup is not blocked.
python3 /app/server.py
