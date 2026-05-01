@echo off
cd /d C:\zaykama_recovery_bundle

echo FIND TRANSLATE METHODS
echo.

python -c "from pathlib import Path;import ast;s=Path('zaykama_v9_5_tts_hook.py').read_text(encoding='utf-8',errors='ignore');print('FILE SIZE:',len(s));print('HAS translate_segments:', 'translate_segments' in s);print('HAS translate_text:', 'translate_text' in s);print('');tree=ast.parse(s);[print(str(n.lineno)+': def '+n.name) for n in ast.walk(tree) if isinstance(n,ast.FunctionDef) and 'translat' in n.name.lower()]"

echo.
echo SHOW TEXT MATCHES
echo.

findstr /n /i "translate translation gemini ollama" zaykama_v9_5_tts_hook.py

pause