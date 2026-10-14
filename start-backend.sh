#!/usr/bin/env bash
# First run: creates a virtualenv, installs dependencies and a .env. Starts the API on http://localhost:5000
set -e
cd "$(dirname "$0")/backend"
[ -d .venv ] || python3 -m venv .venv
source .venv/bin/activate
pip install -q -r requirements.txt
[ -f .env ] || cp .env.example .env
python app.py
