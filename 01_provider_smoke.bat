@echo off
chcp 65001 >nul
cd /d C:\zaykama_recovery_bundle
echo.
echo === ZAYKAMA 01: PROVIDER SMOKE TEST ===
echo This checks real Mongolian Edge-TTS voices and ffmpeg.
echo.
python zaykama_v9_5_tts_hook.py --provider-smoke --headless
echo.
echo === RESULT FILES ===
if exist outputs\provider_smoke\provider_smoke_report.json (
  type outputs\provider_smoke\provider_smoke_report.json
) else (
  echo provider_smoke_report.json not found.
)
echo.
pause
