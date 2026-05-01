from pathlib import Path
import ast

p = Path("zaykama_v9_5_tts_hook.py")
s = p.read_text(encoding="utf-8", errors="ignore")

if "ZAYKAMA_GEMINI_TRANSLATE_SEGMENTS_V1" in s:
    print("Gemini patch already exists")
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
        # ZAYKAMA_GEMINI_TRANSLATE_SEGMENTS_V1
        self.reset_translation_state()

        import os
        import json
        import urllib.request
        from pathlib import Path

        provider = (
            os.getenv("ZAYKAMA_TRANSLATION_PROVIDER")
            or os.getenv("TRANSLATION_PROVIDER")
            or getattr(self, "translation_provider", "")
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

        key_path = Path("GEMINI_API_KEY.txt")
        if not key_path.exists():
            raise RuntimeError("GEMINI_API_KEY.txt not found")

        api_key = key_path.read_text(encoding="utf-8").strip()
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
                "You are a native Mongolian dubbing script editor from Mongolia. "
                "Convert the English line into ONE natural spoken Mongolian dubbing line. "
                "First understand the meaning silently. Then write how a Mongolian person would naturally say it in a casual video. "
                "Do not translate word by word. Do not sound robotic. Do not add explanation. "
                "Preserve emotion, casual tone, and short dubbing-friendly rhythm. "
                "Forbidden bad Mongolian phrases: бялуутай болчихлоо, торттой болчихсон, тортоор болсон, хамрахсан, тандалсан. "
                "Return only the final Mongolian line. "
                "English: " + source
            )

            try:
                body = json.dumps({
                    "contents": [{"parts": [{"text": prompt}]}],
                    "generationConfig": {
                        "temperature": 0.0
                    }
                }).encode("utf-8")

                url = "https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent"

                req = urllib.request.Request(
                    url,
                    data=body,
                    headers={
                        "Content-Type": "application/json",
                        "x-goog-api-key": api_key
                    },
                    method="POST"
                )

                with urllib.request.urlopen(req, timeout=180) as resp:
                    data = json.loads(resp.read().decode("utf-8", errors="ignore"))

                translated = data["candidates"][0]["content"]["parts"][0]["text"].strip()

                if translated:
                    segment["mongolianText"] = translated
                    segment["translationMode"] = "provider_translation"
                    segment["translationProvider"] = "gemini"
                    segment["translationWarning"] = ""
                    provider_count += 1
                else:
                    segment["mongolianText"] = "[Монгол орчуулга шаардлагатай] " + source
                    segment["translationMode"] = "fallback_marker"
                    segment["translationProvider"] = "fallback"
                    segment["translationWarning"] = "Gemini empty response"
                    fallback_count += 1

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
        self.log_message(f"Gemini translation provider used: {provider_count}/{len(segments)} segments")
        return segments'''

backup = p.with_suffix(".py.bak_before_gemini_patch")
backup.write_text(s, encoding="utf-8")

lines[start:end] = new_func.splitlines()
p.write_text("\\n".join(lines) + "\\n", encoding="utf-8")

print("GEMINI PATCH OK")
print("Backup:", backup)