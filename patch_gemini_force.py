from pathlib import Path
import ast

p = Path("zaykama_v9_5_tts_hook.py")
s = p.read_text(encoding="utf-8", errors="ignore")

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
        # ZAYKAMA_GEMINI_FORCE_TRANSLATION_V2
        self.reset_translation_state()

        import os
        import json
        import urllib.request
        from pathlib import Path

        provider = (
            os.getenv("ZAYKAMA_TRANSLATION_PROVIDER")
            or os.getenv("TRANSLATION_PROVIDER")
            or ""
        ).strip().lower()

        if provider != "gemini":
            for segment in segments:
                result = self.translate_text(segment.get("sourceText", ""), {"source_lang": self.detected_language})
                segment["mongolianText"] = result["text"]
                segment["translationMode"] = result["mode"]
                segment["translationProvider"] = result["provider"]
                segment["translationWarning"] = result.get("warning", "")
            return segments

        key = Path("GEMINI_API_KEY.txt").read_text(encoding="utf-8").strip()
        model = os.getenv("GEMINI_MODEL") or "gemini-2.5-flash"

        provider_count = 0
        fallback_count = 0
        empty_count = 0
        warnings = []

        for segment in segments:
            source = (segment.get("sourceText") or "").strip()

            if not source:
                segment["mongolianText"] = ""
                segment["translationMode"] = "empty"
                segment["translationProvider"] = "gemini"
                segment["translationWarning"] = ""
                empty_count += 1
                continue

            prompt = (
                "You are a native Mongolian dubbing translator and script editor from Mongolia. "
                "Translate the English source into ONE natural spoken Mongolian line for video dubbing. "
                "Do not translate word by word. Do not sound robotic. "
                "Preserve the meaning, emotion, and casual rhythm. "
                "Use everyday Mongolian from Mongolia. "
                "Avoid awkward direct translations. "
                "Return only Mongolian. No explanation.\\n\\n"
                "English source:\\n" + source
            )

            try:
                body = json.dumps({
                    "contents": [{"parts": [{"text": prompt}]}],
                    "generationConfig": {"temperature": 0.0}
                }).encode("utf-8")

                url = "https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent"

                req = urllib.request.Request(
                    url,
                    data=body,
                    headers={
                        "Content-Type": "application/json",
                        "x-goog-api-key": key
                    },
                    method="POST"
                )

                with urllib.request.urlopen(req, timeout=180) as resp:
                    data = json.loads(resp.read().decode("utf-8", errors="ignore"))

                translated = data["candidates"][0]["content"]["parts"][0]["text"].strip()

                segment["mongolianText"] = translated
                segment["translationMode"] = "provider_translation"
                segment["translationProvider"] = "gemini"
                segment["translationWarning"] = ""
                provider_count += 1

            except Exception as exc:
                segment["mongolianText"] = "[Монгол орчуулга шаардлагатай] " + source
                segment["translationMode"] = "fallback_marker"
                segment["translationProvider"] = "fallback"
                segment["translationWarning"] = str(exc)
                warnings.append(str(exc))
                fallback_count += 1

        self.real_translation_used = provider_count > 0
        self.translation_provider = "gemini" if self.real_translation_used else "fallback"
        self.translation_mode = "provider_translation" if self.real_translation_used else "fallback_marker"
        self.translation_summary = {
            "total": len(segments),
            "memory_hit": 0,
            "provider_translation": provider_count,
            "fallback_marker": fallback_count,
            "empty": empty_count,
        }
        self.translation_warnings = warnings
        self.log_message(f"Gemini FORCE translation provider used: {provider_count}/{len(segments)} segments")
        return segments'''

backup = p.with_suffix(".py.bak_before_gemini_force")
backup.write_text(s, encoding="utf-8")

lines[start:end] = new_func.splitlines()
p.write_text("\\n".join(lines) + "\\n", encoding="utf-8")

print("GEMINI FORCE PATCH OK")
print("Backup:", backup)