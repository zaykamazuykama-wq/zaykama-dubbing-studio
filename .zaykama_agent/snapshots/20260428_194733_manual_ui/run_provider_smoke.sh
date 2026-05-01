#!/usr/bin/env bash
set -e

echo "=== Python version ==="
python --version

echo "=== Pip version ==="
python -m pip --version

echo "=== ffmpeg check ==="
ffmpeg -version | head -n 1

echo "=== Install provider dependency ==="
python -m pip install --upgrade edge-tts

echo "=== py_compile ==="
python -m py_compile zaykama_v9_5_tts_hook.py && echo "PY_COMPILE_PASS"

echo "=== self-test ==="
python zaykama_v9_5_tts_hook.py --self-test --headless

echo "=== provider smoke ==="
python zaykama_v9_5_tts_hook.py --provider-smoke --headless || true

echo "=== provider smoke JSON ==="
if [ -f outputs/provider_smoke/provider_smoke_report.json ]; then
  cat outputs/provider_smoke/provider_smoke_report.json
else
  echo "provider_smoke_report.json not found"
fi

echo "=== provider smoke Markdown ==="
if [ -f outputs/provider_smoke/provider_smoke_report.md ]; then
  cat outputs/provider_smoke/provider_smoke_report.md
else
  echo "provider_smoke_report.md not found"
fi
