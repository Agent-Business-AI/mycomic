#!/usr/bin/env bash
# Run the Comic Pilot FastAPI backend.
# Put LLAMAGEN_SESSION_TOKEN in .env (copy from .env.example) so you don't need to export it.

cd "$(dirname "$0")"

python3 -m pip install -q -r requirements.txt
python3 -m uvicorn comic_pilot_backend:app --reload --port 8000
