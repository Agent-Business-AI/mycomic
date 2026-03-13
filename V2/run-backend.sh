#!/usr/bin/env bash
# Run Comic Pilot V2 backend (Node.js + LlamaGen SDK)
# Set LLAMAGEN_API_KEY in .env

cd "$(dirname "$0")"

npm install --silent 2>/dev/null || true
node server.js
