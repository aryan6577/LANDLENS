#!/usr/bin/env bash
# One-command launcher (macOS / Linux). Creates a virtual environment, installs dependencies and starts LandLens.
set -e
cd "$(dirname "$0")/backend"
[ -d venv ] || python3 -m venv venv
./venv/bin/pip install -q -r requirements.txt
echo ""
echo "  LandLens is starting at  http://localhost:8000"
echo "  (press Ctrl+C to stop)"
echo ""
./venv/bin/uvicorn app.main:app --port 8000
