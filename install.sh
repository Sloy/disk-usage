#!/bin/bash
set -e

INSTALL_DIR=/opt/disk-usage
SCAN_PATH="${SCAN_PATH:-/mnt/storage}"
SCAN_NAME="${SCAN_NAME:-Storage}"
SCAN_INTERVAL="${SCAN_INTERVAL:-6h}"
PORT="${PORT:-8888}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "=== Disk Usage Visualizer - Installer ==="
echo "  Install dir:   $INSTALL_DIR"
echo "  Scan path:     $SCAN_PATH"
echo "  Scan name:     $SCAN_NAME"
echo "  Scan interval: $SCAN_INTERVAL"
echo "  Port:          $PORT"
echo

if [ "$(id -u)" -ne 0 ]; then
    echo "Error: run as root." >&2
    exit 1
fi

# If the service is already running via Docker, the native systemd install
# below would conflict with it (same port, competing process). Detect and
# bail out (or offer to upgrade the Docker deployment instead) before doing
# any other work.
if docker ps --filter "name=^/disk-usage$" --format '{{.Names}}' 2>/dev/null | grep -q .; then
    echo "Detected disk-usage already running via Docker."
    echo "The native install would conflict with it (same port)."
    do_upgrade=false
    if [ "${AUTO_DOCKER_UPGRADE:-}" = "1" ]; then
        do_upgrade=true
    elif [ -t 0 ]; then
        read -r -p "Upgrade the Docker deployment instead? [y/N] " reply
        [[ "$reply" =~ ^[Yy]$ ]] && do_upgrade=true
    fi
    if [ "$do_upgrade" = true ]; then
        echo "Upgrading Docker deployment..."
        (cd "$SCRIPT_DIR" && docker compose up -d --build)
    else
        echo "To upgrade manually, run:"
        echo "  cd $SCRIPT_DIR && git pull && docker compose up -d --build"
    fi
    exit 0
fi

# Stop existing services if running
systemctl stop disk-usage disk-usage-scan.timer 2>/dev/null || true

# Install python3 if needed
if ! command -v python3 &>/dev/null; then
    echo "Installing python3..."
    apt-get update -qq
    apt-get install -y --no-install-recommends python3
fi

# Create install directory
mkdir -p "$INSTALL_DIR/www"

# Copy app files (skip when running in-place, e.g. repo cloned directly
# into $INSTALL_DIR and updated via `git pull && bash install.sh`).
if [ "$SCRIPT_DIR" != "$INSTALL_DIR" ]; then
    cp "$SCRIPT_DIR/scan.py" "$SCRIPT_DIR/scan_all.py" "$SCRIPT_DIR/server.py" \
       "$SCRIPT_DIR/roots.py" "$INSTALL_DIR/"
    cp "$SCRIPT_DIR/index.html" "$SCRIPT_DIR/app.js" "$SCRIPT_DIR/favicon.svg" "$INSTALL_DIR/"
    mkdir -p "$INSTALL_DIR/vendor"
    cp "$SCRIPT_DIR"/vendor/*.js "$INSTALL_DIR/vendor/"
fi
chmod +x "$INSTALL_DIR/scan.py" "$INSTALL_DIR/scan_all.py" "$INSTALL_DIR/server.py"
# Remove the pre-multi-root data file (new code reads data-<id>.json); harmless if absent.
rm -f "$INSTALL_DIR/www/data.json"

# Build "Environment=..." lines for every SCAN_PATH*/SCAN_NAME* currently set.
# Use REAL newlines (not \n escapes) so `printf '%s\n' "$ENV_LINES"` emits them
# verbatim and values containing % or \ are never interpreted as printf directives.
ENV_LINES=""
nl=$'\n'
for var in $(env | grep -oE '^SCAN_(PATH|NAME)(_[0-9]+)?' | sort -u); do
  line="Environment=\"$var=${!var}\""
  ENV_LINES="${ENV_LINES:+$ENV_LINES$nl}$line"
done
# Legacy single-root fallback.
[ -z "$ENV_LINES" ] && ENV_LINES="Environment=\"SCAN_PATH=$SCAN_PATH\"${nl}Environment=\"SCAN_NAME=$SCAN_NAME\""

ON_CALENDAR=$(python3 -c "
i='${SCAN_INTERVAL:-1d}'; n=i[:-1]; u=i[-1]
print('daily' if i=='1d' else (f'*-*-* 0/{n}:00:00' if u=='h' else (f'*:0/{n}' if u=='m' else 'daily')))
")

# Web server service
cat > /etc/systemd/system/disk-usage.service << EOF
[Unit]
Description=Disk Usage Visualizer
After=network.target

[Service]
Type=simple
$(printf '%s\n' "$ENV_LINES")
Environment="PORT=$PORT"
ExecStart=/usr/bin/python3 $INSTALL_DIR/server.py
Restart=on-failure
WorkingDirectory=$INSTALL_DIR
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

# Periodic scan service (triggered by the timer)
cat > /etc/systemd/system/disk-usage-scan.service << EOF
[Unit]
Description=Disk Usage Scanner (all roots)

[Service]
Type=oneshot
$(printf '%s\n' "$ENV_LINES")
ExecStart=/usr/bin/python3 $INSTALL_DIR/scan_all.py $INSTALL_DIR/www
WorkingDirectory=$INSTALL_DIR
StandardOutput=journal
StandardError=journal
EOF

# Timer
cat > /etc/systemd/system/disk-usage-scan.timer << EOF
[Unit]
Description=Periodic Disk Usage Scan

[Timer]
OnCalendar=$ON_CALENDAR
OnBootSec=5min
Persistent=true

[Install]
WantedBy=timers.target
EOF

systemctl daemon-reload
systemctl enable disk-usage.service disk-usage-scan.timer
systemctl restart disk-usage.service
systemctl start disk-usage-scan.timer

echo
echo "Running at http://$(hostname -I | awk '{print $1}'):$PORT"
echo "Logs: journalctl -u disk-usage -f"
