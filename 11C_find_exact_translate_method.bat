@echo off
chcp 65001 >nul
cd /d C:\zaykama_recovery_bundle

python -c "from pathlib import Path;s=Path('zaykama_v9_5_tts_hook.py').read_text(encoding='utf-8',errors='ignore').splitlines();idx=next((i for i,l in enumerate(s) if 'def translate_segments' in l),-1);start=max(0,idx-10);end=min(len(s),idx+90);open('exact_translate_method.txt','w',encoding='utf-8').write('\n'.join(f'{i+1}: {s[i]}' for i in range(start,end)));print('FOUND LINE:',idx+1);print('Saved exact_translate_method.txt')"

type exact_translate_method.txt
pause