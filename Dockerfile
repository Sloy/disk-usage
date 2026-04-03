FROM python:3.12-slim

WORKDIR /app

COPY scan.py /app/scan.py
COPY index.html /app/www/index.html
COPY entrypoint.sh /app/entrypoint.sh

RUN chmod +x /app/entrypoint.sh /app/scan.py

EXPOSE 8888

ENV SCAN_PATH=/data
ENV SCAN_INTERVAL=6h

ENTRYPOINT ["/app/entrypoint.sh"]
