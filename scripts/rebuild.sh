#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
for program in node npm python blender ffmpeg; do
  command -v "$program" >/dev/null || { echo "Missing required program: $program" >&2; exit 1; }
done
python -c 'import numpy' || { echo 'Install numpy: python -m pip install -r requirements-dev.txt' >&2; exit 1; }
npm ci
npm run rebuild
npm test
echo 'Rebuilt and validated. GitHub Pages files are in docs/.'
