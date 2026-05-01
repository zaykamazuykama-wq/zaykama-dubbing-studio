@echo off
setlocal enabledelayedexpansion
title Zaykama Real TTS Video Test

cd /d "%~dp0"

echo ============================================================
echo ZAYKAMA REAL TTS VIDEO TEST
echo ============================================================
echo.

if not exist "zaykama_v9_5_tts_hook.py" (
  echo ERROR: zaykama_v9_5_tts_hook.py not found.
  echo Put this BAT inside C:\zaykama_recovery_bundle
  pause
  exit /b 1
)

if not exist "sample_real_30s.mp4" (
  echo ERROR: sample_real_30s.mp4 not found.
  echo Copy a 30-second MP4 into this folder and name it sample_real_30s.mp4
  pause
  exit /b 1
)

echo [1/5] Checking ffmpeg...
ffmpeg -version >nul 2>&1
if errorlevel 1 (
  echo ERROR: ffmpeg is not available. Install ffmpeg first.
  pause
  exit /b 1
)
echo FFmpeg OK.
echo.

echo [2/5] Checking edge-tts...
python -m pip install --upgrade edge-tts
echo.

echo [3/5] Setting real TTS provider for this run...
set TTS_PROVIDER=edge_tts
echo TTS_PROVIDER=%TTS_PROVIDER%
echo.

echo [4/5] Running real video input with Edge-TTS enabled...
python zaykama_v9_5_tts_hook.py --input sample_real_30s.mp4 --headless
echo.

echo [5/5] Showing key manifest...
if exist "outputs\preview_bundle\manifest.json" (
  type "outputs\preview_bundle\manifest.json"
) else (
  echo No manifest found.
)

echo.
echo ============================================================
echo CHECK OUTPUTS
echo ============================================================
echo Look for:
echo real_transcription_used: true
echo real_speech_tts_used: true
echo audio_master_mode: provider_tts_assembled
echo real_audio_master_used: true
echo.
echo Note:
echo real_translation_used may still be false until a real translation provider is configured.
echo Final video may stay blocked because the strict guard requires real_translation_used=true.
echo.
echo Screenshot this window and send it to ChatGPT.
echo ============================================================
pause
