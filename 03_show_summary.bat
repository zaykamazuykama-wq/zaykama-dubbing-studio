@echo off
chcp 65001 >nul
cd /d C:\zaykama_recovery_bundle
echo.
echo === ZAYKAMA 03: SHOW PIPELINE SUMMARY ===
echo.
if not exist outputs\segments.json (
  echo ERROR: outputs\segments.json not found.
  echo Run 02_real_video_test.bat first.
  echo.
  pause
  exit /b 1
)
python -c "import json; d=json.load(open('outputs/segments.json',encoding='utf-8')); keys=['pipeline_mode','real_transcription_used','asr_skipped','real_translation_used','real_speech_tts_used','tts_provider','tts_mode','tts_summary','translation_provider','translation_mode','translation_summary','audio_master_mode','real_audio_master_used','audio_master_warnings']; print(json.dumps({k:d.get(k) for k in keys},ensure_ascii=False,indent=2))"
echo.
echo === MANIFEST ===
if exist outputs\preview_bundle\manifest.json (
  type outputs\preview_bundle\manifest.json
)
echo.
pause
