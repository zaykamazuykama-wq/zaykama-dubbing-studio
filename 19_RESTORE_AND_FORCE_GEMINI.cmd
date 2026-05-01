@echo off
cd /d C:\zaykama_recovery_bundle

echo REPAIR: restore parseable backup and force Gemini
echo.

python -c "from pathlib import Path;import ast,shutil;files=[Path('zaykama_v9_5_tts_hook.py')]+sorted(Path('.').glob('zaykama_v9_5_tts_hook.py.bak*'),key=lambda p:p.stat().st_mtime,reverse=True);best=None;print('Candidates:');[print(' -',f.name) for f in files if f.exists()];print(''); 
for f in files:
    try:
        s=f.read_text(encoding='utf-8',errors='ignore')
        t=ast.parse(s)
        ok=any(isinstance(n,ast.FunctionDef) and n.name=='translate_segments' for n in ast.walk(t))
        print(f.name,'OK' if ok else 'NO translate_segments')
        if ok and best is None: best=f
    except Exception as e:
        print(f.name,'BAD',e)
if best is None: raise SystemExit('NO GOOD BACKUP FOUND')
print('RESTORE FROM:',best)
shutil.copy2('zaykama_v9_5_tts_hook.py','zaykama_v9_5_tts_hook.py.broken_before_restore')
if best.name!='zaykama_v9_5_tts_hook.py': shutil.copy2(best,'zaykama_v9_5_tts_hook.py')"

if errorlevel 1 pause & exit /b 1

echo.
echo Now run Gemini patch again...
python patch_gemini.py
if errorlevel 1 pause & exit /b 1

echo.
echo Check py_compile...
python -m py_compile zaykama_v9_5_tts_hook.py
if errorlevel 1 pause & exit /b 1

set TRANSLATION_PROVIDER=gemini
set ZAYKAMA_TRANSLATION_PROVIDER=gemini
set GEMINI_MODEL=gemini-2.5-flash

echo.
echo Clean old outputs...
del outputs\segments.json 2>nul
del outputs\dubbed_audio_master.wav 2>nul
del outputs\final_dubbed_gemini.mp4 2>nul

echo.
echo Run Zaykama with Gemini...
python zaykama_v9_5_tts_hook.py --headless --input sample_real_30s.mp4

echo.
echo Create final Gemini video...
ffmpeg -y -i sample_real_30s.mp4 -i outputs\dubbed_audio_master.wav -map 0:v:0 -map 1:a:0 -c:v copy -c:a aac -shortest outputs\final_dubbed_gemini.mp4

echo.
echo Show translation providers:
python -c "import json;from pathlib import Path;data=json.loads(Path('outputs/segments.json').read_text(encoding='utf-8'));items=data.get('segments',data) if isinstance(data,dict) else data;[print(str(i)+'. '+str(x.get('translationProvider',''))+' / '+str(x.get('translationMode',''))+'\nSRC: '+str(x.get('sourceText',''))+'\nMN: '+str(x.get('mongolianText',''))+'\n') for i,x in enumerate(items,1) if isinstance(x,dict)]"

echo.
echo Final check:
type outputs\preview_bundle\manifest.json | findstr /i "real_translation_used"
if exist outputs\final_dubbed_gemini.mp4 echo OK final_dubbed_gemini.mp4 created

pause