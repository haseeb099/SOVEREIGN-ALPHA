#!/bin/sh
set -e
PORT="${PORT:-8000}"
WORKERS="${WEB_CONCURRENCY:-2}"
exec uvicorn main:app --host 0.0.0.0 --port "$PORT" --workers "$WORKERS"
