@echo off
chcp 65001 >nul
cd /d C:\zaykama_recovery_bundle

echo ==========================================
echo PATCH ZAYKAMA OLLAMA REAL TRANSLATION
echo ==========================================

python - <<PY
from pathlib import Path
import ast

p = Path("zaykama_v9_5_tts_hook.py")
s = p.read_text(encoding="utf-8", errors="ignore")
if "ZAYKAMA_OLLAMA_TRANSLATION_PATCH_V1" in s:
    print("Patch already exists.")
else:
    tree = ast.parse(s)
    target = None
    for node in ast.walk(tree):
        if isinstance(node, ast.FunctionDef) and node.name == "translate_segments":
            target = node
            break
    if target is None:
        raise SystemExit("ERROR: def translate_segments not found")

    lines = s.splitlines()
    insert_at = target.lineno

    block = r'''
        # ZAYKAMA_OLLAMA_TRANSLATION_PATCH_V1
        import os as _z_os
        import json as _z_json
        import urllib.request as _z_urllib_request

        _z_provider = (
            _z_os.getenv("ZAYKAMA_TRANSLATION_PROVIDER")
            or _z_os.getenv("TRANSLATION_PROVIDER")
            or getattr(self, "translation_provider", "")
            or ""
        ).lower()

        if _z_provider == "ollama":
            _z_base = (
                _z_os.getenv("OLLAMA_BASE_URL")
                or "http://localhost:11434"
            ).rstrip("/")
            _z_model = (
                _z_os.getenv("OLLAMA_TRANSLATION_MODEL")
                or _z_os.getenv("OLLAMA_MODEL")
                or "qwen2.5:3b"
            )

            _z_provider_count = 0
            _z_fallback_count = 0
            _z_empty_count = 0
            _z_warnings = []

            for _z_segment in segments:
                _z_source = (_z_segment.get("sourceText") or "").strip()
                if not _z_source:
                    _z_segment["mongolianText"] = ""
                    _z_segment["translationMode"] = "empty"
                    _z_empty_count += 1
                    continue

                _z_prompt = (
                    "Translate the following text into natural everyday Mongolian from Mongolia. "
                    "Return only the Mongolian translation. Do not explain. Do not add notes.\n\n"
                    f"Text:\n{_z_source}"
                )

                try:
                    _z_payload = _z_json.dumps({
                        "model": _z_model,
                        "prompt": _z_prompt,
                        "stream": False
                    }).encode("utf-8")

                    _z_req = _z_urllib_request.Request(
                        _z_base + "/api/generate",
                        data=_z_payload,
                        headers={"Content-Type": "application/json"},
                        method="POST",
                    )

                    with _z_urllib_request.urlopen(_z_req, timeout=180) as _z_resp:
                        _z_data = _z_json.loads(_z_resp.read().decode("utf-8", errors="ignore"))

                    _z_text = (_z_data.get("response") or "").strip()

                    if _z_text:
                        _z_segment["mongolianText"] = _z_text
                        _z_segment["translationMode"] = "provider_translation"
                        _z_segment["translationProvider"] = "ollama"
                        _z_provider_count += 1
                    else:
                        _z_segment["mongolianText"] = "[MN_TRANSLATION_PENDING] " + _z_source
                        _z_segment["translationMode"] = "fallback_marker"
                        _z_segment["translationProvider"] = "fallback"
                        _z_fallback_count += 1

                except Exception as _z_exc:
                    _z_segment["mongolianText"] = "[MN_TRANSLATION_PENDING] " + _z_source
                    _z_segment["translationMode"] = "fallback_marker"
                    _z_segment["translationProvider"] = "fallback"
                    _z_fallback_count += 1
                    _z_warnings.append(str(_z_exc))

            self.real_translation_used = _z_provider_count > 0
            self.translation_provider = "ollama" if self.real_translation_used else "fallback"
            self.translation_mode = "provider_translation" if self.real_translation_used else "fallback_marker"
            self.translation_summary = {
                "total": len(segments),
                "memory_hit": 0,
                "provider_translation": _z_provider_count,
                "fallback_marker": _z_fallback_count,
                "empty": _z_empty_count,
            }
            self.translation_warnings = _z_warnings

            if hasattr(self, "log_message"):
                self.log_message(
                    f"Ollama translation provider used: {_z_provider_count}/{len(segments)} segments"
                )

            return segments
'''
    lines[insert_at:insert_at] = block.splitlines()
    p.with_suffix(".py.bak_before_ollama_patch").write_text(s, encoding="utf-8")
    p.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("Patch inserted into translate_segments.")
PY

if errorlevel 1 (
    echo PATCH FAILED.
    pause
    exit /b 1
)

echo.
echo Checking py_compile...
python -m py_compile zaykama_v9_5_tts_hook.py
if errorlevel 1 (
    echo py_compile FAILED.
    pause
    exit /b 1
)

echo py_compile PASS.
echo.

set TRANSLATION_PROVIDER=ollama
set ZAYKAMA_TRANSLATION_PROVIDER=ollama
set TRANSLATION_MODE=ollama
set ZAYKAMA_TRANSLATION_MODE=ollama
set OLLAMA_BASE_URL=http://localhost:11434
set OLLAMA_MODEL=qwen2.5:3b
set OLLAMA_TRANSLATION_MODEL=qwen2.5:3b

start "" /min ollama serve
timeout /t 5 /nobreak >nul

echo Running real video test with Ollama...
call 08_real_video_with_ollama_translation.bat

echo.
echo ==========================================
echo FINAL CHECK
echo ==========================================
type outputs\preview_bundle\manifest.json | findstr /i "real_translation_used translation_provider translationProvider translation_mode translationMode ollama fallback"
echo.
pause