# Disk Usage Visualizer

A lightweight, self-hosted web app for visualizing disk usage with an interactive donut chart and file browser.

![screenshot](screenshot.png)

## Features

- **Interactive donut chart** — click to drill into folders, hover to see sizes
- **Free space visualization** — root level shows used vs free space
- **ncdu-style file list** — sorted by size with relative size bars
- **Breadcrumb navigation** — click to jump back to any parent
- **Auto-rescan** — periodically rescans storage in the background
- **Tiny footprint** — Python only, no dependencies, ~50MB Docker image

## Quick Start

### Docker Compose (recommended)

```yaml
services:
  disk-usage:
    build: .
    # image: ghcr.io/youruser/disk-usage:latest  # when published
    container_name: disk-usage
    restart: unless-stopped
    ports:
      - "8888:8888"
    volumes:
      - /path/to/your/storage:/data:ro
    environment:
      - SCAN_PATH=/data
      - SCAN_INTERVAL=6h
```

```bash
docker compose up -d
```

Open `http://localhost:8888`

### Docker Run

```bash
docker build -t disk-usage .

docker run -d \
  --name disk-usage \
  --restart unless-stopped \
  -p 8888:8888 \
  -v /path/to/your/storage:/data:ro \
  disk-usage
```

## Configuration

| Environment Variable | Default | Description |
|---------------------|---------|-------------|
| `SCAN_PATH` | `/data` | Path to scan inside the container |
| `SCAN_INTERVAL` | `6h` | Time between automatic rescans (e.g., `1h`, `12h`, `1d`) |

## Manual Rescan

Trigger a rescan without restarting the container:

```bash
docker exec disk-usage python3 /app/scan.py /data /app/www/data.json
```

## How It Works

1. `scan.py` recursively walks the mounted directory and builds a JSON tree of file/folder sizes
2. The scan result is saved as `data.json`
3. A Python HTTP server serves the static `index.html` which fetches and renders the data
4. A background loop rescans at the configured interval

No database, no dependencies, no build step.

## License

MIT
