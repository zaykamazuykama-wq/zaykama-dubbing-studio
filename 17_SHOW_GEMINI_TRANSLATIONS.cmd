@echo off
cd /d C:\zaykama_recovery_bundle

echo GEMINI TRANSLATION OUTPUTS
echo.

python -c "import json;from pathlib import Path;p=Path('outputs/segments.json');data=json.loads(p.read_text(encoding='utf-8'));[print(str(x.get('id'))+'. SRC: '+x.get('sourceText','')+'\nMN: '+x.get('mongolianText','')+'\nMODE: '+x.get('translationMode','')+' / '+x.get('translationProvider','')+'\n') for x in data]"

pause