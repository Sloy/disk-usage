#!/bin/sh

echo "=== Disk Usage Visualizer ==="
echo "Scan path: $SCAN_PATH"
echo "Rescan interval: ${SCAN_INTERVAL:-6h}"

# Run initial scan
python3 /app/scan.py "$SCAN_PATH" /app/www/data.json

# Set up cron for periodic rescans
CRON_EXPR=$(python3 -c "
interval = '${SCAN_INTERVAL:-6h}'
num = int(interval[:-1])
unit = interval[-1]
if unit == 'h':
    print(f'0 */{num} * * *')
elif unit == 'd':
    print(f'0 0 */{num} * *')
elif unit == 'm':
    print(f'*/{num} * * * *')
else:
    print('0 */6 * * *')
")

echo "$CRON_EXPR python3 /app/scan.py $SCAN_PATH /app/www/data.json >> /proc/1/fd/1 2>&1" > /etc/cron.d/disk-scan
chmod 0644 /etc/cron.d/disk-scan
crontab /etc/cron.d/disk-scan

# Start cron daemon in background
cron

# Start web server
python3 /app/server.py
