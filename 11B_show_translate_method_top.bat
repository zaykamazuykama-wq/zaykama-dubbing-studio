@echo off
chcp 65001 >nul
cd /d C:\zaykama_recovery_bundle

echo Showing translate_segments TOP area...

python -c "from pathlib import Path;s=Path('zaykama_v9_5_tts_hook.py').read_text(encoding='utf-8',errors='ignore').splitlines();start=390;end=490;open('translate_method_top.txt','w',encoding='utf-8').write('\n'.join(f'{i+1}: {s[i]}' for i in range(start-1,min(end,len(s)))))"

echo.
echo ==========================================
type translate_method_top.txt
echo ==========================================
echo.
pause