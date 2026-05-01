@echo off
cd /d C:\zaykama_recovery_bundle

echo PATCH GEMINI TRANSLATION
python patch_gemini.py
if errorlevel 1 pause & exit /b 1

echo CHECK PY COMPILE
python -m py_compile zaykama_v9_5_tts_hook.py
if errorlevel 1 pause & exit /b 1

set TRANSLATION_PROVIDER=gemini
set ZAYKAMA_TRANSLATION_PROVIDER=gemini
set GEMINI_MODEL=gemini-2.5-flash

echo RUN ZAYKAMA WITH GEMINI
python zaykama_v9_5_tts_hook.py

echo CREATE FINAL VIDEO
ffmpeg -y -i sample_real_30s.mp4 -i outputs\dubbed_audio_master.wav -map 0:v:0 -map 1:a:0 -c:v copy -c:a aac -shortest outputs\final_dubbed_gemini.mp4

echo.
echo FINAL CHECK
type outputs\preview_bundle\manifest.json | findstr /i "real_translation_used translation_provider translation_mode gemini fallback"
echo.

if exist outputs\final_dubbed_gemini.mp4 (
    echo OK final_dubbed_gemini.mp4 created
) else (
    echo MISSING final_dubbed_gemini.mp4
)

pause