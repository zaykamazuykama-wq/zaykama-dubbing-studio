@echo off
setlocal
title Zaykama Final Summary

cd /d "%~dp0"

echo ============================================================
echo ZAYKAMA FINAL SUMMARY
echo ============================================================
echo.

if exist "outputs\preview_bundle\manifest.json" (
  echo MANIFEST:
  type "outputs\preview_bundle\manifest.json"
) else (
  echo No manifest found.
)

echo.
if exist "outputs\segments.json" (
  echo SEGMENTS SUMMARY:
  python -c "import json; d=json.load(open('outputs/segments.json',encoding='utf-8')); print('translation_summary=',d.get('translation_summary')); print('tts_summary=',d.get('tts_summary')); print('audio_master_mode=',d.get('audio_master_mode')); print('real_audio_master_used=',d.get('real_audio_master_used')); print('first_segment=',d.get('segments',[{}])[0])"
) else (
  echo No segments.json found.
)

echo.
echo ============================================================
echo DONE. Screenshot this window and send it to ChatGPT.
echo ============================================================
pause
