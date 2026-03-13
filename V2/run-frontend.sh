#!/usr/bin/env bash
# Run Comic Pilot V2 React frontend

cd "$(dirname "$0")/frontend"
npm install --silent 2>/dev/null || true
npm run dev
