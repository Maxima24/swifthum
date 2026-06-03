# syntax=docker/dockerfile:1.7
# SwiftHum Telegram bot — aiogram long-poll + Redis pub/sub listener.
# Build context is the repo root.

FROM python:3.12-slim AS runtime

# tini for clean signal handling (so SIGTERM stops aiogram polling immediately).
RUN apt-get update \
 && apt-get install -y --no-install-recommends tini \
 && rm -rf /var/lib/apt/lists/* \
 && groupadd -r app && useradd -r -g app -m -d /home/app app

WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# Install Python deps first (separate cache layer from source).
COPY apps/bot/requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt \
 && rm /tmp/requirements.txt

# Source last.
COPY --chown=app:app apps/bot/main.py /app/main.py
COPY --chown=app:app apps/bot/src /app/src

USER app
ENTRYPOINT ["/usr/bin/tini","--"]
CMD ["python","main.py"]
