@echo off
cd /d C:\zaykama_recovery_bundle

echo CLEAN GEMINI FULL RUN
echo.

set TRANSLATION_PROVIDER=gemini
set ZAYKAMA_TRANSLATION_PROVIDER=gemini
set GEMINI_MODEL=gemini-2.5-flash
set TTS_PROVIDER=edge_tts

echo CLEAN OLD OUTPUT FILES
del outputs\segments.json 2>nul
del outputs\segments.csv 2>nul
del outputs\subtitles.srt 2>nul
del outputs\subtitles.vtt 2>nul
del outputs\dubbed_audio_master.wav 2>nul
del outputs\final_dubbed_gemini.mp4 2>nul

echo.
echo RUN PIPELINE
python zaykama_v9_5_tts_hook.py --headless --input sample_real_30s.mp4

echo.
echo CHECK REAL OUTPUTS
if exist outputs\segments.json echo OK segments.json
if not exist outputs\segments.json echo MISSING segments.json

if exist outputs\dubbed_audio_master.wav echo OK dubbed_audio_master.wav
if not exist outputs\dubbed_audio_master.wav echo MISSING dubbed_audio_master.wav

echo.
echo CREATE FINAL VIDEO ONLY IF AUDIO MASTER EXISTS
if exist outputs\dubbed_audio_master.wav (
    ffmpeg -y -i sample_real_30s.mp4 -i outputs\dubbed_audio_master.wav -map 0:v:0 -map 1:a:0 -c:v copy -c:a aac -shortest outputs\final_dubbed_gemini.mp4
)

echo.
echo SHOW TRANSLATIONS IF JSON EXISTS
if exist outputs\segments.json (
    python -c "import json;from pathlib import Path;data=json.loads(Path('outputs/segments.json').read_text(encoding='utf-8'));items=data.get('segments',data) if isinstance(data,dict) else data;[print(str(i)+'. '+str(x.get('translationProvider',''))+' / '+str(x.get('translationMode',''))+'\nSRC: '+str(x.get('sourceText',''))+'\nMN: '+str(x.get('mongolianText',''))+'\n') for i,x in enumerate(items,1) if isinstance(x,dict)]"
)

echo.
echo FINAL CHECK
if exist outputs\final_dubbed_gemini.mp4 echo OK final_dubbed_gemini.mp4 created
if not exist outputs\final_dubbed_gemini.mp4 echo MISSING final_dubbed_gemini.mp4

echo.
pause