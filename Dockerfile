FROM python:3.12-slim

RUN apt-get update && apt-get install -y --no-install-recommends cron && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY scan.py /app/scan.py
COPY server.py /app/server.py
COPY index.html /app/www/index.html
COPY entrypoint.sh /app/entrypoint.sh

RUN chmod +x /app/entrypoint.sh /app/scan.py /app/server.py

EXPOSE 8888

ENV SCAN_PATH=/data
ENV SCAN_NAME=Storage
ENV SCAN_INTERVAL=6h

ENTRYPOINT ["/app/entrypoint.sh"]
