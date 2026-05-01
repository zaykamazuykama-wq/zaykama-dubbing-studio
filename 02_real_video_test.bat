@echo off
chcp 65001 >nul
cd /d C:\zaykama_recovery_bundle
echo.
echo === ZAYKAMA 02: REAL 30 SECOND VIDEO TEST ===
echo Put your video here first:
echo C:\zaykama_recovery_bundle\sample_real_30s.mp4
echo.
if not exist sample_real_30s.mp4 (
  echo ERROR: sample_real_30s.mp4 not found.
  echo Copy your 30-second MP4 into C:\zaykama_recovery_bundle and rename it to sample_real_30s.mp4
  echo.
  pause
  exit /b 1
)
python zaykama_v9_5_tts_hook.py --input sample_real_30s.mp4 --headless
echo.
echo === DONE. Now run 03_show_summary.bat ===
echo.
pause
