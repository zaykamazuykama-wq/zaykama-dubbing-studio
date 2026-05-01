@echo off
chcp 65001 >nul
cd /d C:\zaykama_recovery_bundle

echo Finding Zaykama translation hook...

python -c "from pathlib import Path;p=Path('zaykama_v9_5_tts_hook.py');s=p.read_text(encoding='utf-8',errors='ignore').splitlines();keys=['translate','translation','fallback','real_translation_used','fallback_marker','mongolian'];open('translation_hook_report.txt','w',encoding='utf-8').write('\n'.join(f'{i+1}: {line}' for i,line in enumerate(s) if any(k.lower() in line.lower() for k in keys)))"

echo.
echo Report created:
echo C:\zaykama_recovery_bundle\translation_hook_report.txt
echo.
echo Showing report:
echo ==========================================
type translation_hook_report.txt
echo ==========================================
echo.
pause