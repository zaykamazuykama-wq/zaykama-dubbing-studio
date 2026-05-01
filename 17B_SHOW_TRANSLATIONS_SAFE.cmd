@echo off
cd /d C:\zaykama_recovery_bundle

echo SAFE TRANSLATION OUTPUT CHECK
echo.

python -c "import json;from pathlib import Path;p=Path('outputs/segments.json');data=json.loads(p.read_text(encoding='utf-8'));items=data.get('segments',data) if isinstance(data,dict) else data;print('TYPE:',type(data).__name__);print('COUNT:',len(items) if hasattr(items,'__len__') else 'unknown');print('');[print(str(i)+'. SRC: '+str(x.get('sourceText',x.get('source',''))) + '\nMN: '+str(x.get('mongolianText',x.get('text',''))) + '\nMODE: '+str(x.get('translationMode',''))+' / '+str(x.get('translationProvider',''))+'\n') if isinstance(x,dict) else print(str(i)+'. RAW: '+str(x)+'\n') for i,x in enumerate(items,1)]"

pause