FROM python:3.12-slim

RUN apt-get update && apt-get install -y --no-install-recommends cron && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY scan.py scan_all.py server.py roots.py /app/
COPY index.html app.js favicon.svg /app/www/
COPY vendor/ /app/www/vendor/
COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh /app/scan.py /app/scan_all.py /app/server.py

EXPOSE 8888

ENV SCAN_PATH=/data
ENV SCAN_NAME=Storage
ENV SCAN_INTERVAL=1d

ENTRYPOINT ["/app/entrypoint.sh"]
