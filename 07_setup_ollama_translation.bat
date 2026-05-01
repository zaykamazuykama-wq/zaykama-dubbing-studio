@echo off
setlocal
title Zaykama Ollama Translation Setup

echo ============================================================
echo ZAYKAMA OLLAMA TRANSLATION SETUP
echo ============================================================
echo.

echo This will install/check Ollama and pull a small translation-capable model.
echo It may take time the first time.
echo.

cd /d "%~dp0"

echo [1/4] Checking Ollama...
ollama --version >nul 2>&1
if errorlevel 1 (
  echo Ollama not found. Trying winget install...
  winget install Ollama.Ollama
  echo.
  echo If Ollama was installed now, close this window, open Ollama once from Start Menu,
  echo then run this BAT again.
  pause
  exit /b 1
)
echo Ollama OK.
echo.

echo [2/4] Starting Ollama service if needed...
start "" /min ollama serve
timeout /t 5 >nul
echo.

echo [3/4] Pulling model qwen2.5:3b...
ollama pull qwen2.5:3b
if errorlevel 1 (
  echo.
  echo Model pull failed. Check internet/Ollama.
  pause
  exit /b 1
)
echo.

echo [4/4] Setup check done.

echo.
echo ============================================================
echo OLLAMA SETUP DONE
echo Next run: 08_real_video_with_ollama_translation.bat
echo ============================================================
pause
