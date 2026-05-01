@echo off
cd /d C:\zaykama_recovery_bundle

python patch_ollama.py
if errorlevel 1 pause & exit /b 1

python -m py_compile zaykama_v9_5_tts_hook.py
if errorlevel 1 pause & exit /b 1

set TRANSLATION_PROVIDER=ollama
set ZAYKAMA_TRANSLATION_PROVIDER=ollama
set OLLAMA_BASE_URL=http://localhost:11434
set OLLAMA_MODEL=qwen2.5:3b
set OLLAMA_TRANSLATION_MODEL=qwen2.5:3b

start "" /min ollama serve
timeout /t 5 /nobreak >nul

call 08_real_video_with_ollama_translation.bat

type outputs\preview_bundle\manifest.json | findstr /i "real_translation_used translation_provider translation_mode ollama fallback"

pause