from pathlib import Path
import ast

p = Path("zaykama_v9_5_tts_hook.py")
s = p.read_text(encoding="utf-8", errors="ignore")

if "ZAYKAMA_OLLAMA_TRANSLATE_SEGMENTS_FIXED_V2" in s:
    print("Patch already exists")
    raise SystemExit(0)

tree = ast.parse(s)
target = None
for node in ast.walk(tree):
    if isinstance(node, ast.FunctionDef) and node.name == "translate_segments":
        target = node
        break

if target is None:
    raise SystemExit("translate_segments not found")

lines = s.splitlines()
start = target.lineno - 1
end = target.end_lineno

new_func = '''    def translate_segments(self, segments: list[dict[str, Any]]) -> list[dict[str, Any]]:
        # ZAYKAMA_OLLAMA_TRANSLATE_SEGMENTS_FIXED_V2
        self.reset_translation_state()

        import os
        import json
        import urllib.request

        provider = (os.getenv("ZAYKAMA_TRANSLATION_PROVIDER") or os.getenv("TRANSLATION_PROVIDER") or "").lower()

        if provider != "ollama":
            for segment in segments:
                result = self.translate_text(segment.get("sourceText", ""), {"source_lang": self.detected_language})
                segment["mongolianText"] = result["text"]
                segment["translationMode"] = result["mode"]
                segment["translationProvider"] = result["provider"]
                segment["translationWarning"] = result.get("warning", "")
            return segments

        base_url = (os.getenv("OLLAMA_BASE_URL") or "http://localhost:11434").rstrip("/")
        model = os.getenv("OLLAMA_TRANSLATION_MODEL") or os.getenv("OLLAMA_MODEL") or "qwen2.5:3b"

        provider_count = 0
        fallback_count = 0
        empty_count = 0
        warnings = []

        for segment in segments:
            source = (segment.get("sourceText") or "").strip()
            if not source:
                segment["mongolianText"] = ""
                segment["translationMode"] = "empty"
                segment["translationProvider"] = "ollama"
                segment["translationWarning"] = ""
                empty_count += 1
                continue

            prompt = "Translate to natural everyday Mongolian only. Do not explain. Text: " + source

            try:
                payload = json.dumps({"model": model, "prompt": prompt, "stream": False}).encode("utf-8")
                req = urllib.request.Request(
                    base_url + "/api/generate",
                    data=payload,
                    headers={"Content-Type": "application/json"},
                    method="POST",
                )
                with urllib.request.urlopen(req, timeout=180) as resp:
                    data = json.loads(resp.read().decode("utf-8", errors="ignore"))

                translated = (data.get("response") or "").strip()

                if translated:
                    segment["mongolianText"] = translated
                    segment["translationMode"] = "provider_translation"
                    segment["translationProvider"] = "ollama"
                    segment["translationWarning"] = ""
                    provider_count += 1
                else:
                    segment["mongolianText"] = "[Монгол орчуулга шаардлагатай] " + source
                    segment["translationMode"] = "fallback_marker"
                    segment["translationProvider"] = "fallback"
                    segment["translationWarning"] = "Ollama empty response"
                    fallback_count += 1

            except Exception as exc:
                segment["mongolianText"] = "[Монгол орчуулга шаардлагатай] " + source
                segment["translationMode"] = "fallback_marker"
                segment["translationProvider"] = "fallback"
                segment["translationWarning"] = str(exc)
                warnings.append(str(exc))
                fallback_count += 1

        self.real_translation_used = provider_count > 0
        self.translation_provider = "ollama" if self.real_translation_used else "fallback"
        self.translation_mode = "provider_translation" if self.real_translation_used else "fallback_marker"
        self.translation_summary = {
            "total": len(segments),
            "memory_hit": 0,
            "provider_translation": provider_count,
            "fallback_marker": fallback_count,
            "empty": empty_count,
        }
        self.translation_warnings = warnings
        self.log_message(f"Ollama translation provider used: {provider_count}/{len(segments)} segments")
        return segments'''

backup = p.with_suffix(".py.bak_ollama_v2")
backup.write_text(s, encoding="utf-8")

lines[start:end] = new_func.splitlines()
p.write_text("\n".join(lines) + "\n", encoding="utf-8")

print("PATCH OK")
print("Backup:", backup)