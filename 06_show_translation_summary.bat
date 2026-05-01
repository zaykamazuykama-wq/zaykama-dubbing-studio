@echo off
setlocal
title Zaykama Translation Summary

cd /d "%~dp0"

echo ============================================================
echo ZAYKAMA TRANSLATION SUMMARY
echo ============================================================
echo.

if not exist "outputs\segments.json" (
  echo ERROR: outputs\segments.json not found.
  echo First run 05_real_video_with_edge_tts.bat
  pause
  exit /b 1
)

set TEMP_SCRIPT=%TEMP%\zaykama_show_translation_summary.py

> "%TEMP_SCRIPT%" echo import json
>> "%TEMP_SCRIPT%" echo from pathlib import Path
>> "%TEMP_SCRIPT%" echo segments_path = Path("outputs/segments.json")
>> "%TEMP_SCRIPT%" echo manifest_path = Path("outputs/preview_bundle/manifest.json")
>> "%TEMP_SCRIPT%" echo d = json.loads(segments_path.read_text(encoding="utf-8"))
>> "%TEMP_SCRIPT%" echo print("=== PIPELINE STATE ===")
>> "%TEMP_SCRIPT%" echo for k in ["pipeline_mode","real_transcription_used","asr_skipped","real_translation_used","real_speech_tts_used","audio_master_mode","real_audio_master_used","tts_provider","tts_mode","translation_provider","translation_mode"]:
>> "%TEMP_SCRIPT%" echo     print(f"{k}: {d.get(k)}")
>> "%TEMP_SCRIPT%" echo print()
>> "%TEMP_SCRIPT%" echo print("=== TRANSLATION SUMMARY ===")
>> "%TEMP_SCRIPT%" echo print(json.dumps(d.get("translation_summary", {}), ensure_ascii=False, indent=2))
>> "%TEMP_SCRIPT%" echo print()
>> "%TEMP_SCRIPT%" echo print("=== TTS SUMMARY ===")
>> "%TEMP_SCRIPT%" echo print(json.dumps(d.get("tts_summary", {}), ensure_ascii=False, indent=2))
>> "%TEMP_SCRIPT%" echo print()
>> "%TEMP_SCRIPT%" echo print("=== AUDIO MASTER WARNINGS ===")
>> "%TEMP_SCRIPT%" echo print(json.dumps(d.get("audio_master_warnings", []), ensure_ascii=False, indent=2))
>> "%TEMP_SCRIPT%" echo print()
>> "%TEMP_SCRIPT%" echo print("=== SEGMENTS ===")
>> "%TEMP_SCRIPT%" echo for s in d.get("segments", []):
>> "%TEMP_SCRIPT%" echo     print("-" * 60)
>> "%TEMP_SCRIPT%" echo     print("id:", s.get("id"))
>> "%TEMP_SCRIPT%" echo     print("start/end:", s.get("start"), "->", s.get("end"))
>> "%TEMP_SCRIPT%" echo     print("sourceText:", s.get("sourceText"))
>> "%TEMP_SCRIPT%" echo     print("mongolianText:", s.get("mongolianText"))
>> "%TEMP_SCRIPT%" echo     print("translationMode:", s.get("translationMode"))
>> "%TEMP_SCRIPT%" echo     print("translationProvider:", s.get("translationProvider"))
>> "%TEMP_SCRIPT%" echo     print("ttsMode:", s.get("ttsMode"))
>> "%TEMP_SCRIPT%" echo     print("ttsProvider:", s.get("ttsProvider"))
>> "%TEMP_SCRIPT%" echo     print("ttsWarning:", s.get("ttsWarning"))
>> "%TEMP_SCRIPT%" echo     print("ttsPath:", s.get("ttsPath"))
>> "%TEMP_SCRIPT%" echo if manifest_path.exists():
>> "%TEMP_SCRIPT%" echo     print()
>> "%TEMP_SCRIPT%" echo     print("=== MANIFEST ===")
>> "%TEMP_SCRIPT%" echo     m = json.loads(manifest_path.read_text(encoding="utf-8"))
>> "%TEMP_SCRIPT%" echo     print(json.dumps(m, ensure_ascii=False, indent=2))

python "%TEMP_SCRIPT%"

echo.
echo ============================================================
echo DONE. Screenshot this window and send it to ChatGPT.
echo ============================================================
pause
