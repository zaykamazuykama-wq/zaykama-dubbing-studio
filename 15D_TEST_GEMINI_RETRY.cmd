@echo off
cd /d C:\zaykama_recovery_bundle

echo TEST GEMINI RETRY + FALLBACK
echo.

python -c "from pathlib import Path;import json,urllib.request,time;key=Path('GEMINI_API_KEY.txt').read_text(encoding='utf-8').strip();models=['gemini-2.5-flash','gemini-2.0-flash','gemini-1.5-flash'];prompt='You are a native Mongolian dubbing script editor from Mongolia. Convert the English line into ONE natural spoken Mongolian dubbing line. Meaning: someone just received/got cake. Forbidden: бялуутай болчихлоо, торттой болчихсон, тортоор болсон. Good examples: Хэн сая бялуу авсныг таагаарай. / Хэн бялуу авчихсан гээч? Return only final Mongolian. English: Guess who just got some cake.';last=None
for model in models:
    for attempt in range(3):
        try:
            print('MODEL:',model,'TRY:',attempt+1)
            body=json.dumps({'contents':[{'parts':[{'text':prompt}]}],'generationConfig':{'temperature':0.0}}).encode('utf-8')
            req=urllib.request.Request('https://generativelanguage.googleapis.com/v1beta/models/'+model+':generateContent',data=body,headers={'Content-Type':'application/json','x-goog-api-key':key},method='POST')
            r=urllib.request.urlopen(req,timeout=120)
            data=json.loads(r.read().decode('utf-8'))
            print('')
            print('RESULT:')
            print(data['candidates'][0]['content']['parts'][0]['text'])
            raise SystemExit(0)
        except Exception as e:
            last=e
            print('FAILED:',e)
            time.sleep(5)
print('ALL FAILED:',last)
raise SystemExit(1)"

echo.
pause