@echo off
cd /d C:\zaykama_recovery_bundle

echo TEST GEMINI TRANSLATION
echo.

if not exist GEMINI_API_KEY.txt (
    echo MISSING GEMINI_API_KEY.txt
    echo GEMINI_API_KEY.txt file uusgeed API key-ee dotor ni hiine.
    pause
    exit /b 1
)

python -c "from pathlib import Path;import json,urllib.request;key=Path('GEMINI_API_KEY.txt').read_text(encoding='utf-8').strip();prompt='You are a professional Mongolian dubbing translator. Translate into natural everyday spoken Mongolian from Mongolia. Not literal. Not robotic. Return only Mongolian. Text: Guess who just got some cake.';body=json.dumps({'contents':[{'parts':[{'text':prompt}]}],'generationConfig':{'temperature':0.2}}).encode('utf-8');req=urllib.request.Request('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',data=body,headers={'Content-Type':'application/json','x-goog-api-key':key},method='POST');r=urllib.request.urlopen(req,timeout=120);data=json.loads(r.read().decode('utf-8'));print(data['candidates'][0]['content']['parts'][0]['text'])"

echo.
pause