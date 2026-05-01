@echo off
cd /d C:\zaykama_recovery_bundle

echo TEST GEMINI STRONG PROMPT
echo.

python -c "from pathlib import Path;import json,urllib.request;key=Path('GEMINI_API_KEY.txt').read_text(encoding='utf-8').strip();prompt='You are a professional native Mongolian dubbing translator from Mongolia. Translate the English line into natural spoken Mongolian for video dubbing. Preserve meaning, emotion, and casual tone. Do NOT translate literally. Do NOT use awkward phrases like торттой болчихсон, тортоор болсон, хамрахсан, тандалсан. Glossary: cake = бялуу, guess who = хэн гэдгийг таагаарай / хэн сая ... таагаарай. Return only one clean Mongolian sentence. English: Guess who just got some cake.';body=json.dumps({'contents':[{'parts':[{'text':prompt}]}],'generationConfig':{'temperature':0.1}}).encode('utf-8');req=urllib.request.Request('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',data=body,headers={'Content-Type':'application/json','x-goog-api-key':key},method='POST');r=urllib.request.urlopen(req,timeout=120);data=json.loads(r.read().decode('utf-8'));print(data['candidates'][0]['content']['parts'][0]['text'])"

echo.
pause