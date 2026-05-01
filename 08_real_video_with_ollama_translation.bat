@echo off
setlocal
title Zaykama Real Video With Ollama Translation

cd /d "%~dp0"

echo ============================================================
echo ZAYKAMA REAL VIDEO + OLLAMA TRANSLATION TEST
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
  echo Copy a 30-second MP4 here and name it sample_real_30s.mp4
  pause
  exit /b 1
)

echo [1/5] Checking ffmpeg...
ffmpeg -version >nul 2>&1
if errorlevel 1 (
  echo ERROR: ffmpeg not found.
  pause
  exit /b 1
)
echo FFmpeg OK.
echo.

echo [2/5] Checking edge-tts...
python -m pip install --upgrade edge-tts
echo.

echo [3/5] Checking Ollama...
ollama --version >nul 2>&1
if errorlevel 1 (
  echo ERROR: Ollama not found.
  echo Run 07_setup_ollama_translation.bat first.
  pause
  exit /b 1
)
start "" /min ollama serve
timeout /t 5 >nul
echo Ollama OK.
echo.

echo [4/5] Running real pipeline with Edge-TTS + Ollama translation...
set TTS_PROVIDER=edge_tts
set TRANSLATION_PROVIDER=ollama
set OLLAMA_MODEL=qwen2.5:3b

python zaykama_v9_5_tts_hook.py --input sample_real_30s.mp4 --headless
echo.

echo [5/5] Showing manifest...
if exist "outputs\preview_bundle\manifest.json" (
  type "outputs\preview_bundle\manifest.json"
) else (
  echo No manifest found.
)

echo.
echo ============================================================
echo EXPECTED CHECK
echo ============================================================
echo Look for:
echo real_transcription_used: true
echo real_translation_used: true
echo real_speech_tts_used: true
echo audio_master_mode: provider_tts_assembled
echo real_audio_master_used: true
echo.
echo If real_translation_used is false, Ollama/model did not answer correctly.
echo Screenshot this window and send it to ChatGPT.
echo ============================================================
pause
