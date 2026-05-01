@echo off
cd /d C:\zaykama_recovery_bundle

echo TEST GEMINI TWO PASS TRANSLATION
echo.

python -c "from pathlib import Path;import json,urllib.request;key=Path('GEMINI_API_KEY.txt').read_text(encoding='utf-8').strip();prompt='You are a native Mongolian dubbing script editor from Mongolia. Task: convert the English line into ONE natural spoken Mongolian dubbing line. First understand the meaning silently. Then write how a Mongolian person would naturally say it in a casual video. Important: English phrase \"just got some cake\" means someone received/got cake. It does NOT mean became cake, has cake as a condition, or is with cake. Forbidden bad Mongolian phrases: бялуутай болчихлоо, торттой болчихсон, тортоор болсон, хамрахсан, тандалсан. Good examples: \"Хэн сая бялуу авсныг таагаарай.\" / \"Хэн бялуу авчихсан гээч?\" Return only the final Mongolian line, no explanation. English: Guess who just got some cake.';body=json.dumps({'contents':[{'parts':[{'text':prompt}]}],'generationConfig':{'temperature':0.0}}).encode('utf-8');req=urllib.request.Request('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',data=body,headers={'Content-Type':'application/json','x-goog-api-key':key},method='POST');r=urllib.request.urlopen(req,timeout=120);data=json.loads(r.read().decode('utf-8'));print(data['candidates'][0]['content']['parts'][0]['text'])"

echo.
pause