@echo off
setlocal enabledelayedexpansion
title Zaykama One Click Test

echo ============================================================
echo ZAYKAMA ONE CLICK TEST
echo ============================================================
echo.

REM Always move to the folder where this BAT file is placed
cd /d "%~dp0"

echo [1/7] Current folder:
cd
echo.

if not exist "zaykama_v9_5_tts_hook.py" (
  echo ERROR: zaykama_v9_5_tts_hook.py not found in this folder.
  echo.
  echo Put this BAT file inside:
  echo C:\zaykama_recovery_bundle
  echo.
  pause
  exit /b 1
)

echo [2/7] Checking Python...
python --version
if errorlevel 1 (
  echo.
  echo ERROR: Python is not working.
  echo Install Python and check "Add Python to PATH".
  pause
  exit /b 1
)
echo.

echo [3/7] Checking FFmpeg...
ffmpeg -version >nul 2>&1
if errorlevel 1 (
  echo.
  echo FFmpeg not found. Trying winget install...
  winget install Gyan.FFmpeg
  echo.
  echo If FFmpeg was just installed, close this window and run this BAT again.
  pause
  exit /b 1
)
echo FFmpeg OK.
echo.

echo [4/7] Installing/checking edge-tts...
python -m pip install --upgrade edge-tts
echo.

echo [5/7] Compile + self-test...
python -m py_compile zaykama_v9_5_tts_hook.py
if errorlevel 1 (
  echo.
  echo ERROR: py_compile failed.
  pause
  exit /b 1
)

python zaykama_v9_5_tts_hook.py --self-test --headless
if errorlevel 1 (
  echo.
  echo ERROR: self-test failed.
  pause
  exit /b 1
)
echo.

echo [6/7] Provider smoke test...
python zaykama_v9_5_tts_hook.py --provider-smoke --headless
echo.

echo [7/7] Optional real video test...
if exist "sample_real_30s.mp4" (
  echo Found sample_real_30s.mp4. Running real video test...
  python zaykama_v9_5_tts_hook.py --input sample_real_30s.mp4 --headless
) else (
  echo sample_real_30s.mp4 not found.
  echo To test a real video, copy a 30-second MP4 here and name it:
  echo sample_real_30s.mp4
)
echo.

echo ============================================================
echo SUMMARY
echo ============================================================

if exist "outputs\provider_smoke\provider_smoke_report.json" (
  echo.
  echo Provider Smoke Report:
  type "outputs\provider_smoke\provider_smoke_report.json"
) else (
  echo No provider smoke report found.
)

echo.
echo ------------------------------------------------------------
echo MAIN RESULT TO SEND TO CHATGPT:
echo ------------------------------------------------------------
if exist "outputs\preview_bundle\manifest.json" (
  echo.
  echo Manifest:
  type "outputs\preview_bundle\manifest.json"
) else (
  echo No real video manifest found yet.
)

echo.
echo ============================================================
echo DONE. Screenshot this window and send it to ChatGPT.
echo ============================================================
pause
