@echo off
cd /d C:\zaykama_recovery_bundle

echo FORCE GEMINI PATCH
python patch_gemini_force.py
if errorlevel 1 pause & exit /b 1

echo CHECK PY COMPILE
python -m py_compile zaykama_v9_5_tts_hook.py
if errorlevel 1 pause & exit /b 1

set TRANSLATION_PROVIDER=gemini
set ZAYKAMA_TRANSLATION_PROVIDER=gemini
set GEMINI_MODEL=gemini-2.5-flash

echo CLEAN OLD OUTPUTS
del outputs\segments.json 2>nul
del outputs\dubbed_audio_master.wav 2>nul
del outputs\final_dubbed_gemini.mp4 2>nul

echo RUN ZAYKAMA WITH GEMINI FORCE
python zaykama_v9_5_tts_hook.py

echo CREATE FINAL VIDEO
ffmpeg -y -i sample_real_30s.mp4 -i outputs\dubbed_audio_master.wav -map 0:v:0 -map 1:a:0 -c:v copy -c:a aac -shortest outputs\final_dubbed_gemini.mp4

echo.
echo SHOW TRANSLATION PROVIDERS
python -c "import json;from pathlib import Path;data=json.loads(Path('outputs/segments.json').read_text(encoding='utf-8'));items=data.get('segments',data) if isinstance(data,dict) else data;[print(str(i)+'. '+str(x.get('translationProvider',''))+' / '+str(x.get('translationMode',''))+'\nSRC: '+str(x.get('sourceText',''))+'\nMN: '+str(x.get('mongolianText',''))+'\n') for i,x in enumerate(items,1) if isinstance(x,dict)]"

echo.
echo FINAL CHECK
type outputs\preview_bundle\manifest.json | findstr /i "real_translation_used translation_provider translation_mode gemini ollama fallback"

if exist outputs\final_dubbed_gemini.mp4 echo OK final_dubbed_gemini.mp4 created

pause