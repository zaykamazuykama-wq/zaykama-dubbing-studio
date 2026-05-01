@echo off
cd /d C:\zaykama_recovery_bundle

echo RESTORE CLEAN BACKUP
echo.

copy /Y zaykama_v9_5_tts_hook.py zaykama_v9_5_tts_hook.py.broken_current_backup
copy /Y zaykama_v9_5_tts_hook.py.bak_before_gemini_patch zaykama_v9_5_tts_hook.py

echo.
echo CHECK PY COMPILE BEFORE PATCH
python -m py_compile zaykama_v9_5_tts_hook.py
if errorlevel 1 (
    echo RESTORE FAILED - py_compile failed
    pause
    exit /b 1
)

echo.
echo APPLY GEMINI PATCH
python patch_gemini.py
if errorlevel 1 (
    echo GEMINI PATCH FAILED
    pause
    exit /b 1
)

echo.
echo CHECK PY COMPILE AFTER PATCH
python -m py_compile zaykama_v9_5_tts_hook.py
if errorlevel 1 (
    echo AFTER PATCH py_compile failed
    pause
    exit /b 1
)

set TRANSLATION_PROVIDER=gemini
set ZAYKAMA_TRANSLATION_PROVIDER=gemini
set GEMINI_MODEL=gemini-2.5-flash
set TTS_PROVIDER=edge_tts

echo.
echo CLEAN OLD OUTPUTS
del outputs\segments.json 2>nul
del outputs\dubbed_audio_master.wav 2>nul
del outputs\final_dubbed_gemini.mp4 2>nul

echo.
echo RUN ZAYKAMA WITH GEMINI
python zaykama_v9_5_tts_hook.py --headless --input sample_real_30s.mp4

echo.
echo CREATE FINAL VIDEO
ffmpeg -y -i sample_real_30s.mp4 -i outputs\dubbed_audio_master.wav -map 0:v:0 -map 1:a:0 -c:v copy -c:a aac -shortest outputs\final_dubbed_gemini.mp4

echo.
echo SHOW TRANSLATIONS
python -c "import json;from pathlib import Path;data=json.loads(Path('outputs/segments.json').read_text(encoding='utf-8'));items=data.get('segments',data) if isinstance(data,dict) else data;[print(str(i)+'. '+str(x.get('translationProvider',''))+' / '+str(x.get('translationMode',''))+'\nSRC: '+str(x.get('sourceText',''))+'\nMN: '+str(x.get('mongolianText',''))+'\n') for i,x in enumerate(items,1) if isinstance(x,dict)]"

echo.
echo FINAL CHECK
type outputs\preview_bundle\manifest.json | findstr /i "real_translation_used"
if exist outputs\final_dubbed_gemini.mp4 echo OK final_dubbed_gemini.mp4 created

pause