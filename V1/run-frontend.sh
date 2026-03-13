#!/usr/bin/env bash
# Run the Comic Pilot React frontend.

cd "$(dirname "$0")/frontend"
npm install --silent 2>/dev/null || true
npm run dev -- --port 5555
