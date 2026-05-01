@echo off
cd /d C:\zaykama_recovery_bundle

echo CHECK AFTER GEMINI RUN
echo.

echo OUTPUTS:
dir outputs
echo.

echo PREVIEW MANIFEST:
if exist outputs\preview_bundle\manifest.json (
    type outputs\preview_bundle\manifest.json
) else (
    echo MISSING outputs\preview_bundle\manifest.json
)

echo.
echo IMPORTANT FILES:
if exist outputs\segments.json echo OK segments.json
if not exist outputs\segments.json echo MISSING segments.json

if exist outputs\dubbed_audio_master.wav echo OK dubbed_audio_master.wav
if not exist outputs\dubbed_audio_master.wav echo MISSING dubbed_audio_master.wav

if exist outputs\tts dir outputs\tts
if not exist outputs\tts echo MISSING outputs\tts folder

echo.
pause