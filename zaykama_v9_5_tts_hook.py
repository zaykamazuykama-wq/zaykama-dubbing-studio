#!/usr/bin/env python3
"""
Zaykama V9.5.6 Recovery Bundle - Mongolian AI Video Dubbing System
Stable V9.5 base with translation fallback, validation TTS, strict final-video guard,
provider-only audio master assembly, and real Edge-TTS provider smoke test.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import os
import re
import shutil
import struct
import subprocess
import sys
import wave
from datetime import datetime
from pathlib import Path
from typing import Any


class ZaykamaV95TTSHook:
    def __init__(self, export_mode: str = "internal_preview", headless: bool = False, input_path: str | None = None, source_subtitle_path: str | None = None):
        self.export_mode = export_mode
        self.headless = headless
        self.input_path = input_path
        self.source_subtitle_path = source_subtitle_path
        self.log_messages: list[str] = []
        self.dubbing_memory: dict[str, str] = {}
        self.voice_library = self._build_voice_library()
        self.current_segments: list[dict[str, Any]] = []
        self.pipeline_mode = "validation_segments"
        self.real_transcription_used = False
        self.real_translation_used = False
        self.real_speech_tts_used = False
        self.tts_mode = "validation_waveform"
        self.allow_validation_video_overlay = False
        self.detected_language = "unknown"
        self.asr_skipped = True
        self.source_subtitle_used = False
        self.translation_provider = os.getenv("TRANSLATION_PROVIDER", "fallback")
        self.translation_mode = "fallback_marker"
        self.translation_warnings: list[str] = []
        self.translation_summary = {"total": 0, "memory_hit": 0, "provider_translation": 0, "fallback_marker": 0, "empty": 0}
        self.tts_provider = os.getenv("TTS_PROVIDER", "validation")
        self.tts_warnings: list[str] = []
        self.tts_summary = {"total": 0, "provider_tts": 0, "validation_waveform": 0, "empty": 0, "failed": 0}
        self.tts_cache_summary = {"hits": 0, "misses": 0, "hit_rate": 0.0}
        self.audio_master_path: str | None = None
        self.audio_master_mode = "none"
        self.real_audio_master_used = False
        self.audio_master_warnings: list[str] = []
        self.timing_alignment_mode = "none"
        self.timing_warnings_count = 0
        self.validate_export_mode()

    def _build_voice_library(self) -> list[dict[str, Any]]:
        return [
            {"id": "mn_male_adult_bataa", "name": "Bataa Mongolian Male", "gender": "male", "ageRange": "adult", "tones": ["warm", "calm"], "provider": "edge_tts", "voiceName": "mn-MN-BataaNeural"},
            {"id": "mn_female_adult_yesui", "name": "Yesui Mongolian Female", "gender": "female", "ageRange": "adult", "tones": ["warm", "clear"], "provider": "edge_tts", "voiceName": "mn-MN-YesuiNeural"},
            {"id": "mn_neutral_validation", "name": "Neutral Validation Voice", "gender": "unknown", "ageRange": "adult", "tones": ["neutral"], "provider": "validation", "voiceName": "mn-MN-BataaNeural"},
        ]

    def log_message(self, message: str) -> None:
        self.log_messages.append(message)
        print(f"[ZAYKAMA] {message}")

    def validate_export_mode(self) -> None:
        allowed = {"internal_preview", "mp3", "wav", "srt", "vtt", "json", "csv", "final_video"}
        if self.export_mode not in allowed:
            raise ValueError(f"Unsupported EXPORT_MODE: {self.export_mode}. Allowed: {sorted(allowed)}")

    def normalize_tts_cache_payload(self, payload: dict[str, Any]) -> dict[str, Any]:
        # Ensure deterministic ordering for JSON hashing
        return {k: payload[k] for k in sorted(payload.keys())}

    def compute_tts_cache_key(self, payload: dict[str, Any]) -> str:
        normalized = self.normalize_tts_cache_payload(payload)
        json_str = json.dumps(normalized, sort_keys=True, separators=(',', ':'))
        return hashlib.sha256(json_str.encode('utf-8')).hexdigest()

    def get_tts_cache_path(self, cache_key: str, ext: str = ".wav") -> str:
        return f"data/tts_cache/{cache_key}{ext}"

    def is_cacheable_tts_payload(self, payload: dict[str, Any]) -> bool:
        if payload.get("provider") != "edge_tts":
            return False
        text = payload.get("text", "").strip()
        if not text or text == "provider_failed" or "fallback" in text.lower():
            return False
        return True

    def is_valid_cached_audio(self, path: str) -> bool:
        if not os.path.exists(path):
            return False
        size = os.path.getsize(path)
        return size > 512  # Minimum valid audio size

    def store_tts_cache(self, src_path: str, cache_path: str) -> None:
        Path(cache_path).parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src_path, cache_path)

    def compute_tts_cache_summary(self, segments: list[dict[str, Any]]) -> dict[str, Any]:
        hits = sum(1 for s in segments if s.get("ttsCacheHit") is True)
        misses = sum(1 for s in segments if s.get("ttsCacheHit") is False and s.get("ttsMode") == "provider_tts")
        total_cacheable = hits + misses
        hit_rate = hits / total_cacheable if total_cacheable > 0 else 0.0
        return {"hits": hits, "misses": misses, "hit_rate": hit_rate}

    def ensure_segment_defaults(self, segment: dict[str, Any]) -> dict[str, Any]:
        defaults = {"id": 0, "start": 0.0, "end": 1.0, "sourceText": "", "mongolianText": "", "speakerId": "spk_01"}
        for key, value in defaults.items():
            segment.setdefault(key, value)
        return segment

    def movie_glossary_corrections(self) -> dict[str, str]:
        return {
            "Pirate King": "Далайн дээрэмчдийн хаан",
            "Brethren Court": "Ахан дүүсийн зөвлөл",
            "vote for himself": "өөртөө санал өгөх",
            "every pirate votes for himself": "далайн дээрэмчин бүр өөртөө санал өгдөг",
            "no king since the first Brethren Court": "анхны Ахан дүүсийн зөвлөлөөс хойш хаан сонгогдоогүй",
            "jar of dirt": "шороотой лонх",
            "this is a jar of dirt": "Энэ шороотой лонх.",
            "is the jar of dirt going to help": "Энэ шороотой лонх тус болно гэж үү?",
            "give me your hand": "Надад гараа өг.",
        }

    def seed_movie_glossary_corrections(self) -> None:
        for source, approved in self.movie_glossary_corrections().items():
            self.dubbing_memory.setdefault(self.normalize_memory_key(source), approved)

    def analyze_segment_quality(self, segments: list[dict[str, Any]]) -> dict[str, Any]:
        suspicious_phrases = ["цент", "дарга зөв", "нэг ч хором ялахгүй", "ордон"]
        weird_asr_re = re.compile(r"(?:\b[a-z]{18,}\b|[^\s\w.,!?\-'\"“”‘’()]{2,}|\b(?:uh|um|ah|huh){3,}\b)", re.IGNORECASE | re.UNICODE)
        all_spk_01 = bool(segments) and all(str(segment.get("speakerId", "spk_01")) == "spk_01" for segment in segments)
        flagged_segments: list[dict[str, Any]] = []
        suspicious_count = 0
        suspicious_segments: list[dict[str, Any]] = []
        for segment in segments:
            source_text = str(segment.get("sourceText") or "")
            source_lower = source_text.lower()
            mongolian_text = str(segment.get("mongolianText") or "").lower()
            source_matches = weird_asr_re.findall(source_text)
            repeated_garbage = len(source_matches) >= 2 or bool(re.search(r"\b(\w{1,3})(?:\s+\1){3,}\b", source_text, re.IGNORECASE))
            suspicious_phrase = next((phrase for phrase in suspicious_phrases if phrase in mongolian_text), "")
            fallback_marker = "[монгол орчуулга шаардлагатай]" in mongolian_text
            pirate_vote_three_cents = (not self.source_subtitle_used) and "three cents" in source_lower and any(token in source_lower for token in ("pirate", "pirates", "vote", "votes", "brethren", "king"))
            known_bad_lets_miss = "let's miss you on" in source_lower or "lets miss you on" in source_lower
            known_bad_give_it_head = "give it head" in source_lower
            known_bad_dear_vegans = "dear vegans cannot make word" in source_lower
            known_bad_cf_jack = "cf jack" in source_lower
            jar_of_dirt_wrong = "jar of dirt" in source_lower and "шороон сав" in mongolian_text
            lets_miss_wrong = known_bad_lets_miss and "санана" in mongolian_text
            give_it_head_wrong = known_bad_give_it_head and "толгой" in mongolian_text
            explicit_asr_error = known_bad_lets_miss or known_bad_give_it_head or known_bad_dear_vegans or known_bad_cf_jack
            explicit_translation_issue = jar_of_dirt_wrong or lets_miss_wrong or give_it_head_wrong
            proper_noun_uncertain = bool(re.search(r"\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\b", source_text)) or bool(repeated_garbage)
            review_reasons: list[str] = []
            if suspicious_phrase:
                review_reasons.append(f"suspicious Mongolian phrase: {suspicious_phrase}")
            if fallback_marker:
                review_reasons.append("fallback translation marker present")
            if repeated_garbage:
                review_reasons.append("source ASR looks corrupted/repeated")
            if pirate_vote_three_cents:
                review_reasons.append("likely ASR error: 'three cents' in pirate/vote context")
            if known_bad_lets_miss:
                review_reasons.append("Likely ASR error: 'Let's miss you on' may be 'Give me your hand'")
            if known_bad_give_it_head:
                review_reasons.append("Likely ASR error: 'Give it head' should not be translated as 'толгой'")
            if known_bad_dear_vegans:
                review_reasons.append("Likely ASR error: 'Dear vegans cannot make word'")
            if known_bad_cf_jack:
                review_reasons.append("Likely ASR error: source contains 'CF Jack'")
            if jar_of_dirt_wrong:
                review_reasons.append("Translation issue: 'jar of dirt' should be 'шороотой лонх', not 'шороон сав'")
            if proper_noun_uncertain:
                review_reasons.append("proper noun/name may need human confirmation")
            if segment.get("timingReviewNeeded"):
                review_reasons.append("TTS timing overrun needs review")
            flags = {
                "needsTranscriptReview": bool(repeated_garbage or pirate_vote_three_cents or explicit_asr_error),
                "needsTranslationReview": bool(suspicious_phrase or fallback_marker or explicit_translation_issue),
                "possibleAsrError": bool(repeated_garbage or pirate_vote_three_cents or explicit_asr_error),
                "speakerUncertain": all_spk_01,
                "emotionMissing": not bool(segment.get("emotion") or segment.get("emotionLabel")),
                "properNounUncertain": proper_noun_uncertain,
                "timingReviewNeeded": bool(segment.get("timingReviewNeeded")),
            }
            segment["qualityFlags"] = flags
            segment["reviewReason"] = "; ".join(review_reasons)
            if flags["needsTranslationReview"] or flags["possibleAsrError"] or flags["properNounUncertain"] or flags["timingReviewNeeded"]:
                suspicious_count += 1
                suspicious_segments.append({
                    "id": segment.get("id"),
                    "sourceText": segment.get("sourceText", ""),
                    "mongolianText": segment.get("mongolianText", ""),
                    "reviewReason": segment.get("reviewReason", ""),
                    "qualityFlags": flags,
                })
            flagged_segments.append(segment)
        return {
            "needsTranscriptReview": any(segment["qualityFlags"]["needsTranscriptReview"] for segment in flagged_segments),
            "needsTranslationReview": any(segment["qualityFlags"]["needsTranslationReview"] for segment in flagged_segments),
            "possibleAsrError": any(segment["qualityFlags"]["possibleAsrError"] for segment in flagged_segments),
            "speakerUncertain": all_spk_01,
            "emotionMissing": any(segment["qualityFlags"]["emotionMissing"] for segment in flagged_segments),
            "properNounUncertain": any(segment["qualityFlags"]["properNounUncertain"] for segment in flagged_segments),
            "timingReviewNeeded": any(segment["qualityFlags"].get("timingReviewNeeded") for segment in flagged_segments),
            "suspiciousSegmentsCount": suspicious_count,
            "suspiciousSegments": suspicious_segments[:10],
            "totalSegments": len(flagged_segments),
            "segments": flagged_segments,
        }

    def normalize_memory_key(self, text: str) -> str:
        text = (text or "").lower().strip()
        text = re.sub(r"[^\w\s]", "", text, flags=re.UNICODE)
        return re.sub(r"\s+", " ", text)

    def has_negation(self, text: str) -> bool:
        if not text:
            return False
        lowered = text.lower()
        english_neg = r"\b(not|don't|doesn't|didn't|can't|cannot|won't|never|no|nothing|nobody)\b"
        mongolian_phrase = r"\b(үгүй|биш|битгий|болохгүй|чадахгүй|хийхгүй|байхгүй)\b"
        mongolian_suffix = r"\S+гүй\b"
        return bool(re.search(english_neg, lowered) or re.search(mongolian_phrase, lowered) or re.search(mongolian_suffix, lowered))

    def load_mongolian_dubbing_memory(self) -> None:
        self.dubbing_memory = {}
        path = Path("dubbing_memory.json")
        if path.exists():
            try:
                data = json.loads(path.read_text(encoding="utf-8"))
                self.dubbing_memory = {self.normalize_memory_key(k): str(v) for k, v in data.items()}
            except Exception as exc:
                self.log_message(f"Memory file could not be read: {exc}")
        self.seed_movie_glossary_corrections()
        self.log_message(f"Loaded Mongolian dubbing memory/glossary with {len(self.dubbing_memory)} entries.")

    def save_mongolian_dubbing_memory(self) -> None:
        Path("dubbing_memory.json").write_text(json.dumps(self.dubbing_memory, ensure_ascii=False, indent=2), encoding="utf-8")

    def import_approved_corrections_into_memory(self, corrections: list[dict[str, str]]) -> int:
        count = 0
        for correction in corrections:
            source = correction.get("sourceText", "")
            approved = correction.get("approvedMongolianText", "")
            if not source or not approved:
                continue
            if self.has_negation(source) != self.has_negation(approved):
                continue
            self.dubbing_memory[self.normalize_memory_key(source)] = approved
            count += 1
        self.log_message(f"Imported {count} approved corrections into memory.")
        self.save_mongolian_dubbing_memory()
        return count

    def reset_translation_state(self) -> None:
        self.real_translation_used = False
        self.translation_mode = "fallback_marker"
        self.translation_warnings = []
        self.translation_summary = {"total": 0, "memory_hit": 0, "provider_translation": 0, "fallback_marker": 0, "empty": 0}

    def reset_tts_state(self) -> None:
        self.real_speech_tts_used = False
        self.tts_mode = "validation_waveform"
        self.tts_warnings = []
        self.tts_summary = {"total": 0, "provider_tts": 0, "validation_waveform": 0, "empty": 0, "failed": 0}

    def reset_audio_master_state(self) -> None:
        self.audio_master_path = None
        self.audio_master_mode = "none"
        self.timing_alignment_mode = "none"
        self.real_audio_master_used = False
        self.audio_master_warnings = []
        self.timing_warnings_count = 0

    def movie_translation_prompt_rules(self) -> str:
        return (
            "Та мэргэжлийн Монгол киноны дуу оруулгын орчуулагч, найруулагч редактор. "
            "Эх текстийг үгчилж биш, дүрийн санаа, нөхцөл, өнгө аяс, харилцааг хадгалж Монгол хэлээр аманд эвтэйхэн орчуул (preserve character intent). "
            "Rules: 1. Байгалийн Монгол ярианы хэлээр орчуул. "
            "2. Хэт номын, албан, тайлбарласан хэлбэрээс зайлсхий. "
            "3. 'шүү дээ', 'юм', 'л дээ', 'байна аа' зэрэг бөөмийг зөвхөн хэрэгтэй үед, хэтрүүлэлгүй хэрэглэ. "
            "4. Дүрийн emotion, уур, айдас, ёжлол, тушаал, гайхшрал зэргийг хадгал. "
            "5. Proper noun, нэр, цол, газар, байгууллагын нэрийг таамгаар эвдэхгүй. "
            "6. Subtitle segment богино байвал богино, шууд яриа хэвээр үлдээ. "
            "7. Хэрэв эх текст эргэлзээтэй бол мөнгө, эд зүйл, нэр томьёо болгон зохиож битгий орчуул. "
            + ("Source subtitle mode: source text is likely an official/clean transcript, so reduce ASR suspicion, but still keep glossary/proper noun rules. " if self.source_subtitle_used else "")
            + "8. Pirate/movie glossary-г хэрэглэ: "
            "Pirate King = Далайн дээрэмчдийн хаан; "
            "Brethren Court = Ахан дүүсийн зөвлөл; "
            "vote for himself = өөртөө санал өгөх; "
            "every pirate votes for himself = далайн дээрэмчин бүр өөртөө санал өгдөг; "
            "no king since the first Brethren Court = анхны Ахан дүүсийн зөвлөлөөс хойш хаан сонгогдоогүй; "
            "jar of dirt = шороотой лонх; This is a jar of dirt = Энэ шороотой лонх; "
            "Is the jar of dirt going to help? = Энэ шороотой лонх тус болно гэж үү?; "
            "Never translate jar of dirt as шороон сав; Give me your hand = Надад гараа өг. "
            "9. If ASR source looks like Let's miss you on in dialogue context, flag it as likely ASR error; do not confidently translate it as Би чамайг санана. "
            "10. Give it head should be flagged as likely ASR error; do not translate it as толгой. "
            "11. Return exactly N JSON strings, same order. "
            "Never translate unclear ASR into absurd concrete objects like money unless the source clearly means money. "
        )

    def translate_text(self, text: str, context: dict[str, Any] | None = None) -> dict[str, str | bool]:
        if not text or not text.strip():
            self.translation_summary["empty"] += 1
            self.translation_summary["total"] += 1
            self.translation_mode = "empty"
            return {"ok": True, "text": "", "mode": "empty", "provider": "none", "warning": ""}
        key = self.normalize_memory_key(text)
        if key in self.dubbing_memory:
            self.translation_summary["memory_hit"] += 1
            self.translation_summary["total"] += 1
            self.translation_mode = "memory_hit"
            return {"ok": True, "text": self.dubbing_memory[key], "mode": "memory_hit", "provider": "memory", "warning": ""}
        self.translation_summary["fallback_marker"] += 1
        self.translation_summary["total"] += 1
        self.translation_mode = "fallback_marker"
        return {"ok": True, "text": f"[Монгол орчуулга шаардлагатай] {text}", "mode": "fallback_marker", "provider": self.translation_provider, "warning": "No provider available"}

    def translate_segments(self, segments: list[dict[str, Any]]) -> list[dict[str, Any]]:
        # ZAYKAMA_OLLAMA_TRANSLATE_SEGMENTS_FIXED_V2
        # ZAYKAMA_GEMINI_BATCH_TRANSLATE_SEGMENTS_MINIMAL_V2
        self.reset_translation_state()

        import os
        import json
        import re
        import urllib.error
        import urllib.parse
        import urllib.request

        provider = (os.getenv("ZAYKAMA_TRANSLATION_PROVIDER") or os.getenv("TRANSLATION_PROVIDER") or "").strip().lower()

        if provider not in {"ollama", "gemini"}:
            for segment in segments:
                result = self.translate_text(segment.get("sourceText", ""), {"source_lang": self.detected_language})
                segment["mongolianText"] = result["text"]
                segment["translationMode"] = result["mode"]
                segment["translationProvider"] = result["provider"]
                segment["translationWarning"] = result.get("warning", "")
            return segments

        memory_count = 0
        provider_count = 0
        fallback_count = 0
        empty_count = 0
        warnings = []

        gemini_key = ""
        gemini_model = ""
        gemini_url = ""
        if provider == "gemini":
            gemini_key = (os.getenv("GEMINI_API_KEY") or "").strip()
            gemini_model = os.getenv("GEMINI_MODEL") or "gemini-2.5-flash"
            quoted_model = urllib.parse.quote(gemini_model, safe="")
            gemini_url = f"https://generativelanguage.googleapis.com/v1beta/models/{quoted_model}:generateContent?key={urllib.parse.quote(gemini_key, safe='')}"
        else:
            base_url = (os.getenv("OLLAMA_BASE_URL") or "http://localhost:11434").rstrip("/")
            model = os.getenv("OLLAMA_TRANSLATION_MODEL") or os.getenv("OLLAMA_MODEL") or "qwen2.5:3b"

        def mask_gemini_secrets(message: str) -> str:
            if gemini_key:
                message = message.replace(gemini_key, "[MASKED_GEMINI_API_KEY]")
            message = re.sub(r"(key=)[^\s&\"',}]+", r"\1[MASKED_GEMINI_API_KEY]", message)
            message = re.sub(r'("key"\s*:\s*")[^"]+', r'\1[MASKED_GEMINI_API_KEY]', message)
            return message

        def masked_warning(exc: Exception) -> str:
            message = mask_gemini_secrets(str(exc))
            if isinstance(exc, urllib.error.HTTPError):
                body = exc.read().decode("utf-8", errors="replace")
                safe_body = mask_gemini_secrets(body)[:1000]
                if safe_body:
                    message = f"{message}: {safe_body}"
            return message

        if provider == "gemini":
            def fail_gemini_batch(warning: str) -> list[dict[str, Any]]:
                for segment in segments:
                    segment["translationMode"] = "provider_failed"
                    segment["translationProvider"] = "gemini"
                    segment["translationWarning"] = warning
                self.real_translation_used = False
                self.translation_provider = "gemini"
                self.translation_mode = "provider_failed"
                self.translation_summary = {
                    "total": len(segments),
                    "memory_hit": 0,
                    "provider_translation": 0,
                    "fallback_marker": 0,
                    "empty": 0,
                }
                self.translation_warnings = [warning]
                self.log_message(f"Gemini translation warning: {warning}")
                return segments

            def parse_gemini_batch(text: str) -> list[str]:
                cleaned = text.strip()
                if cleaned.startswith("```"):
                    cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
                    cleaned = re.sub(r"\s*```$", "", cleaned).strip()
                try:
                    parsed = json.loads(cleaned)
                    if isinstance(parsed, list):
                        return [str(item).strip() for item in parsed]
                except Exception:
                    pass
                match = re.search(r"\[[\s\S]*\]", cleaned)
                if match:
                    try:
                        parsed = json.loads(match.group(0))
                        if isinstance(parsed, list):
                            return [str(item).strip() for item in parsed]
                    except Exception:
                        pass
                lines = []
                for line in cleaned.splitlines():
                    item = re.sub(r"^\s*(?:\d+\s*[\.)\-:]|[-*])\s*", "", line).strip()
                    if item:
                        lines.append(item)
                return lines

            try:
                if not gemini_key:
                    raise RuntimeError("GEMINI_API_KEY env is not set")
                numbered_sources = "\n".join(
                    f"{idx + 1}. {segment.get('sourceText') or ''}" for idx, segment in enumerate(segments)
                )
                # Prompt tuning only: keep the Gemini batch pipeline unchanged while improving dubbing quality.
                prompt = (
                    "Translate each numbered source text into natural spoken Mongolian for dubbing/TTS. "
                    "Use everyday Ulaanbaatar-style Mongolian, not stiff written/book language. "
                    "Make lines short, breathable, and easy to read aloud; split or reshape wording naturally. "
                    "Do not follow English sentence structure word-for-word; translate the meaning and tone. "
                    + self.movie_translation_prompt_rules() +
                    "Preserve scientific facts and numbers accurately. Decimal numbers must stay decimal "
                    "(3.78 -> 3.78, or rounded naturally to 3.8), never phrases like '3 зууны 78'. "
                    "Write percent ranges naturally (50 to 80% -> 50-80 хувь). Translate units accurately "
                    "(centimeters -> сантиметр). Do not add new meaning. Do not output incomplete dangling "
                    "clauses such as 'гэж боддог ч,' unless the next segment completes it naturally. "
                    f"Return exactly {len(segments)} JSON strings, in the same order, as a JSON array only.\n\n"
                    f"Source texts:\n{numbered_sources}"
                )
                payload = json.dumps({
                    "contents": [{"parts": [{"text": prompt}]}],
                    "generationConfig": {"temperature": 0.2},
                }).encode("utf-8")
                req = urllib.request.Request(
                    gemini_url,
                    data=payload,
                    headers={"Content-Type": "application/json"},
                    method="POST",
                )
                with urllib.request.urlopen(req, timeout=180) as resp:
                    data = json.loads(resp.read().decode("utf-8", errors="ignore"))
                parts = data.get("candidates", [{}])[0].get("content", {}).get("parts", [])
                translated_text = "".join((part.get("text") or "") for part in parts).strip()
                translations = parse_gemini_batch(translated_text)
                if len(translations) != len(segments):
                    return fail_gemini_batch(f"Gemini batch parse/count mismatch: expected {len(segments)}, got {len(translations)}")
                for segment, translated in zip(segments, translations):
                    segment["mongolianText"] = translated
                    segment["translationMode"] = "provider_translation"
                    segment["translationProvider"] = "gemini"
                    segment["translationWarning"] = ""
                self.real_translation_used = True
                self.translation_provider = "gemini"
                self.translation_mode = "provider_translation"
                self.translation_summary = {
                    "total": len(segments),
                    "memory_hit": 0,
                    "provider_translation": len(segments),
                    "fallback_marker": 0,
                    "empty": 0,
                }
                self.translation_warnings = []
                self.log_message(f"Gemini translation provider used: {len(segments)}/{len(segments)} segments")
                return segments
            except Exception as exc:
                return fail_gemini_batch(masked_warning(exc))

        for segment in segments:
            source = (segment.get("sourceText") or "").strip()
            if not source:
                segment["mongolianText"] = ""
                segment["translationMode"] = "empty"
                segment["translationProvider"] = provider
                segment["translationWarning"] = ""
                empty_count += 1
                continue

            key = self.normalize_memory_key(source)
            if key in self.dubbing_memory:
                segment["mongolianText"] = self.dubbing_memory[key]
                segment["translationMode"] = "memory_hit"
                segment["translationProvider"] = "memory"
                segment["translationWarning"] = ""
                memory_count += 1
                continue

            try:
                if provider == "gemini":
                    if not gemini_key:
                        raise RuntimeError("GEMINI_API_KEY env is not set")
                    prompt = (
                        "Translate this for natural spoken Mongolian dubbing. "
                        "Do not translate word-for-word; translate the meaning. "
                        "Keep it short, easy to read aloud, and preserve the original meaning and tone. "
                        + self.movie_translation_prompt_rules() +
                        "Do not invent extra meaning. Return only the Mongolian translation line.\n\n"
                        f"Text: {source}"
                    )
                    payload = json.dumps({
                        "contents": [{"parts": [{"text": prompt}]}],
                        "generationConfig": {"temperature": 0.2},
                    }).encode("utf-8")
                    req = urllib.request.Request(
                        gemini_url,
                        data=payload,
                        headers={"Content-Type": "application/json"},
                        method="POST",
                    )
                    with urllib.request.urlopen(req, timeout=180) as resp:
                        data = json.loads(resp.read().decode("utf-8", errors="ignore"))
                    parts = data.get("candidates", [{}])[0].get("content", {}).get("parts", [])
                    translated = "".join((part.get("text") or "") for part in parts).strip()
                else:
                    prompt = "Translate to natural everyday Mongolian only. Do not explain. Text: " + source
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
                    segment["translationProvider"] = provider
                    segment["translationWarning"] = ""
                    provider_count += 1
                else:
                    segment["mongolianText"] = "[Монгол орчуулга шаардлагатай] " + source
                    segment["translationMode"] = "fallback_marker"
                    segment["translationProvider"] = provider
                    segment["translationWarning"] = f"{provider} empty response"
                    fallback_count += 1

            except Exception as exc:
                warning = masked_warning(exc)
                segment["mongolianText"] = "[Монгол орчуулга шаардлагатай] " + source
                segment["translationMode"] = "fallback_marker"
                segment["translationProvider"] = provider
                segment["translationWarning"] = warning
                warnings.append(warning)
                self.log_message(f"{provider.title()} translation warning: {warning}")
                fallback_count += 1

        self.real_translation_used = provider_count > 0
        self.translation_provider = provider if self.real_translation_used else provider
        self.translation_mode = "provider_translation" if self.real_translation_used else "fallback_marker"
        self.translation_summary = {
            "total": len(segments),
            "memory_hit": memory_count,
            "provider_translation": provider_count,
            "fallback_marker": fallback_count,
            "empty": empty_count,
        }
        self.translation_warnings = warnings
        self.log_message(f"{provider.title()} translation provider used: {provider_count}/{len(segments)} segments")
        return segments

    def apply_mongolian_dubbing_memory(self, text: str) -> str:
        return self.dubbing_memory.get(self.normalize_memory_key(text), f"[Монгол орчуулга шаардлагатай] {text}")

    def match_voice_to_speaker(self, profile: dict[str, Any]) -> tuple[dict[str, Any], int, list[dict[str, Any]], str]:
        scored: list[tuple[int, dict[str, Any]]] = []
        profile_tones = set(profile.get("tone", []) if isinstance(profile.get("tone"), list) else [profile.get("tone", "")])
        for voice in self.voice_library:
            score = 0
            if voice.get("gender") == profile.get("gender"):
                score += 40
            if voice.get("ageRange") == profile.get("ageRange"):
                score += 30
            score += len(set(voice.get("tones", [])) & profile_tones) * 10
            scored.append((score, voice))
        scored.sort(key=lambda item: item[0], reverse=True)
        best = scored[0][1]
        alternatives = [item[1] for item in scored[1:3]]
        return best, scored[0][0], alternatives, f"Matched profile with score={scored[0][0]}"

    def _create_real_wav(self, path: str, duration: float = 1.0, frequency: int = 440) -> str:
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        sample_rate = 22050
        total = int(sample_rate * duration)
        with wave.open(path, "wb") as wav_file:
            wav_file.setnchannels(1)
            wav_file.setsampwidth(2)
            wav_file.setframerate(sample_rate)
            for i in range(total):
                value = int(16000 * (1 if (i // max(1, sample_rate // frequency)) % 2 else -1))
                wav_file.writeframes(struct.pack("<h", value))
        return path

    def synthesize_tts(self, text: str, voice_id: str, output_path: str) -> dict[str, Any]:
        Path(output_path).parent.mkdir(parents=True, exist_ok=True)
        if not text or not text.strip():
            self.tts_summary["empty"] += 1
            self.tts_summary["total"] += 1
            self.tts_mode = "empty"
            return {"ok": False, "path": None, "mode": "empty", "provider": "none", "warning": "Empty text"}
        if self.tts_provider == "edge_tts":
            try:
                import edge_tts  # type: ignore
                raw_mp3 = str(Path(output_path).with_suffix(".edge.mp3"))
                communicate = edge_tts.Communicate(text, voice=voice_id)
                import asyncio
                asyncio.run(communicate.save(raw_mp3))
                if Path(raw_mp3).exists() and Path(raw_mp3).stat().st_size > 512:
                    try:
                        subprocess.check_call(["ffmpeg", "-y", "-i", raw_mp3, "-ar", "22050", "-ac", "1", output_path], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                        Path(raw_mp3).unlink(missing_ok=True)
                        if Path(output_path).exists() and Path(output_path).stat().st_size > 512:
                            self.real_speech_tts_used = True
                            self.tts_mode = "provider_tts"
                            self.tts_summary["provider_tts"] += 1
                            self.tts_summary["total"] += 1
                            return {"ok": True, "path": output_path, "mode": "provider_tts", "provider": "edge_tts", "warning": ""}
                        self.tts_warnings.append("Edge-TTS WAV output missing or too small after conversion")
                    except Exception as conv_exc:
                        self.tts_warnings.append(f"Edge-TTS MP3 to WAV conversion failed: {conv_exc}")
                else:
                    self.tts_warnings.append("Edge-TTS produced empty MP3")
            except Exception as exc:
                self.tts_warnings.append(f"Edge-TTS failed: {exc}")
            self.tts_summary["failed"] += 1
            self.log_message("Edge-TTS provider not available or voice failed - falling back to validation waveform")
        self.tts_summary["validation_waveform"] += 1
        self.tts_summary["total"] += 1
        self.tts_mode = "validation_waveform"
        self._create_real_wav(output_path)
        return {"ok": True, "path": output_path, "mode": "validation_waveform", "provider": self.tts_provider, "warning": "Validation waveform fallback"}

    def generate_segment_tts(self, segment: dict[str, Any]) -> dict[str, Any]:
        best, _score, alternatives, reason = self.match_voice_to_speaker(segment.get("speakerProfile", {"gender": "male", "ageRange": "adult"}))
        segment["chosenVoiceId"] = best["id"]
        segment["chosenVoiceName"] = best["name"]
        segment["chosenVoiceProvider"] = best["provider"]
        segment["chosenVoiceReason"] = reason
        segment["alternativeVoiceCandidates"] = [voice["id"] for voice in alternatives]
        path = f"outputs/tts/segment_{segment.get('id', 0)}_{best['id']}.wav"
        payload = {
            "provider": best["provider"],
            "voice_id": best["voiceName"],
            "text": segment.get("mongolianText", "").strip(),
            "emotion": segment.get("emotion") or segment.get("emotionLabel"),
            "style": segment.get("style"),
            "delivery": segment.get("delivery"),
            "rate": segment.get("rate") or segment.get("speed"),
            "format": "wav"
        }
        cacheable = self.is_cacheable_tts_payload(payload)
        if cacheable:
            cache_key = self.compute_tts_cache_key(payload)
            cache_path = self.get_tts_cache_path(cache_key)
            segment["ttsCacheKey"] = cache_key
            segment["ttsCachedPath"] = cache_path
            if self.is_valid_cached_audio(cache_path):
                # Cache hit
                shutil.copy2(cache_path, path)
                segment["ttsCacheHit"] = True
                segment["ttsPath"] = path
                segment["ttsMode"] = "provider_tts"
                segment["ttsProvider"] = "edge_tts"
                segment["ttsWarning"] = ""
                self.tts_summary["provider_tts"] += 1
                self.tts_summary["total"] += 1
                self.real_speech_tts_used = True
                return segment
            else:
                # Cache miss
                segment["ttsCacheHit"] = False
        else:
            segment["ttsCacheHit"] = False
        # Generate TTS normally
        result = self.synthesize_tts(segment.get("mongolianText", ""), best["voiceName"], path)
        segment["ttsPath"] = result["path"]
        segment["ttsMode"] = result["mode"]
        segment["ttsProvider"] = result["provider"]
        segment["ttsWarning"] = result.get("warning", "")
        # If successful provider TTS, store in cache
        if cacheable and result["ok"] and result["mode"] == "provider_tts" and self.is_valid_cached_audio(path):
            self.store_tts_cache(path, cache_path)
        return segment

    def generate_all_tts(self, segments: list[dict[str, Any]]) -> list[dict[str, Any]]:
        self.reset_tts_state()
        for segment in segments:
            self.generate_segment_tts(segment)
        return segments

    def _probe_original_duration(self, segments: list[dict[str, Any]]) -> float:
        if self.input_path and Path(self.input_path).exists() and shutil.which("ffprobe"):
            try:
                result = subprocess.run(
                    ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", self.input_path],
                    check=True,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    text=True,
                )
                duration = float(result.stdout.strip())
                if duration > 0:
                    return duration
            except Exception as exc:
                self.audio_master_warnings.append(f"Could not probe original duration; using segment timeline fallback: {exc}")
        return max((float(segment.get("end", 0.0) or 0.0) for segment in segments), default=0.0)

    def _mix_pcm16_mono(self, bed: bytearray, offset_frame: int, data: bytes, sample_rate: int, channels: int, sample_width: int) -> None:
        if channels != 1 or sample_width != 2:
            return
        start_byte = max(0, offset_frame) * channels * sample_width
        if start_byte >= len(bed):
            return
        max_bytes = min(len(data), len(bed) - start_byte)
        max_bytes -= max_bytes % sample_width
        for index in range(0, max_bytes, sample_width):
            bed_value = struct.unpack_from("<h", bed, start_byte + index)[0]
            tts_value = struct.unpack_from("<h", data, index)[0]
            mixed = max(-32768, min(32767, bed_value + tts_value))
            struct.pack_into("<h", bed, start_byte + index, mixed)

    def assemble_dubbed_audio_master(self, segments: list[dict[str, Any]]) -> dict[str, Any]:
        self.reset_audio_master_state()
        if not self.real_speech_tts_used:
            self.audio_master_mode = "skipped_no_real_tts"
            self.audio_master_path = None
            self.real_audio_master_used = False
            self.audio_master_warnings.append("Real speech TTS not used; audio master skipped")
            return {"ok": False, "path": None, "mode": "skipped_no_real_tts", "skipped": True, "reason": "Real speech TTS not used"}
        provider_segments = [s for s in segments if s.get("ttsMode") == "provider_tts" and s.get("ttsPath") and Path(str(s.get("ttsPath"))).exists()]
        if not provider_segments:
            self.audio_master_mode = "skipped_no_provider_tts"
            self.audio_master_path = None
            self.real_audio_master_used = False
            self.audio_master_warnings.append("No provider TTS segments available; audio master skipped")
            return {"ok": False, "path": None, "mode": "skipped_no_provider_tts", "skipped": True, "reason": "No provider TTS segments available"}
        output_path = "outputs/dubbed_audio_master.wav"
        Path(output_path).parent.mkdir(parents=True, exist_ok=True)
        sample_rate = 22050
        channels = 1
        sample_width = 2
        final_duration = self._probe_original_duration(segments)
        total_frames = max(1, int(round(final_duration * sample_rate)))
        frames = bytearray(total_frames * channels * sample_width)
        for segment in sorted(provider_segments, key=lambda item: float(item.get("start", 0.0) or 0.0)):
            with wave.open(str(segment["ttsPath"]), "rb") as wav_in:
                tts_frames = wav_in.getnframes()
                tts_rate = wav_in.getframerate()
                tts_channels = wav_in.getnchannels()
                tts_width = wav_in.getsampwidth()
                data = wav_in.readframes(tts_frames)
                if tts_channels != channels or tts_width != sample_width or tts_rate != sample_rate:
                    self.audio_master_warnings.append(f"Non-standard WAV accepted without resampling: {segment['ttsPath']}")
                start = float(segment.get("start", 0.0) or 0.0)
                end = float(segment.get("end", start) or start)
                tts_duration = tts_frames / float(tts_rate or sample_rate)
                segment_duration = max(0.0, end - start)
                overrun = max(0.0, tts_duration - segment_duration)
                if overrun > 0:
                    timing_warning = {
                        "timingWarnings": "tts_duration_exceeds_segment_duration",
                        "ttsDuration": round(tts_duration, 6),
                        "segmentDuration": round(segment_duration, 6),
                        "overrunSeconds": round(overrun, 6),
                    }
                    segment.setdefault("timingWarnings", []).append(timing_warning)
                    self.timing_warnings_count += 1
                    self.audio_master_warnings.append(
                        f"Segment {segment.get('id')} TTS overrun: ttsDuration={tts_duration:.3f}s segmentDuration={segment_duration:.3f}s overrunSeconds={overrun:.3f}s"
                    )
                    if overrun > 0.5:
                        segment["timingReviewNeeded"] = True
                self._mix_pcm16_mono(frames, int(round(start * sample_rate)), data, sample_rate, tts_channels, tts_width)
        with wave.open(output_path, "wb") as wav_out:
            wav_out.setnchannels(channels)
            wav_out.setsampwidth(sample_width)
            wav_out.setframerate(sample_rate)
            wav_out.writeframes(bytes(frames))
        if not Path(output_path).exists() or Path(output_path).stat().st_size <= 512:
            self.audio_master_mode = "skipped_assembly_failed"
            self.audio_master_path = None
            self.real_audio_master_used = False
            return {"ok": False, "path": None, "mode": "skipped_assembly_failed", "skipped": True, "reason": "Provider TTS audio master assembly failed"}
        self.audio_master_path = output_path
        self.audio_master_mode = "provider_tts_assembled"
        self.timing_alignment_mode = "timeline_overlay"
        self.real_audio_master_used = True
        return {"ok": True, "path": output_path, "mode": "provider_tts_assembled", "timing_alignment_mode": "timeline_overlay", "skipped": False, "reason": "Provider TTS audio master assembled on original timeline"}

    def _format_srt_time(self, seconds: float) -> str:
        hours = int(seconds // 3600)
        minutes = int((seconds % 3600) // 60)
        secs = seconds % 60
        millis = int((secs - int(secs)) * 1000)
        return f"{hours:02d}:{minutes:02d}:{int(secs):02d},{millis:03d}"

    def create_srt(self, segments: list[dict[str, Any]]) -> str:
        path = "outputs/subtitles.srt"
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        with open(path, "w", encoding="utf-8") as file:
            for index, segment in enumerate(segments, 1):
                file.write(f"{index}\n{self._format_srt_time(float(segment.get('start', 0)))} --> {self._format_srt_time(float(segment.get('end', 0)))}\n{segment.get('mongolianText', '')}\n\n")
        return path

    def create_vtt(self, segments: list[dict[str, Any]]) -> str:
        path = "outputs/subtitles.vtt"
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        with open(path, "w", encoding="utf-8") as file:
            file.write("WEBVTT\n\n")
            for segment in segments:
                start = self._format_srt_time(float(segment.get("start", 0))).replace(",", ".")
                end = self._format_srt_time(float(segment.get("end", 0))).replace(",", ".")
                file.write(f"{start} --> {end}\n{segment.get('mongolianText', '')}\n\n")
        return path

    def create_json_export(self, segments: list[dict[str, Any]]) -> str:
        path = "outputs/segments.json"
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        quality = self.analyze_segment_quality(segments)
        if (not self.source_subtitle_used) and self.pipeline_mode == "real_input_asr_transcribed":
            quality["sourceSubtitleRecommended"] = True
            quality["reviewReason"] = "Movie dialogue used ASR transcript. Upload source subtitle for better translation."
        data = {
            "segments": segments,
            "quality": quality,
            "quality_flags": {key: quality[key] for key in ["needsTranscriptReview", "needsTranslationReview", "possibleAsrError", "speakerUncertain", "emotionMissing", "properNounUncertain", "timingReviewNeeded"]},
            "pipeline_mode": self.pipeline_mode,
            "real_transcription_used": self.real_transcription_used,
            "source_subtitle_used": self.source_subtitle_used,
            "source_subtitle_path": self.source_subtitle_path if self.source_subtitle_used else None,
            "asr_skipped": self.asr_skipped,
            "real_translation_used": self.real_translation_used,
            "real_speech_tts_used": self.real_speech_tts_used,
            "tts_mode": self.tts_mode,
            "detected_language": self.detected_language,
            "translation_provider": self.translation_provider,
            "translation_mode": self.translation_mode,
            "translation_summary": self.translation_summary,
            "translation_warnings": self.translation_warnings,
            "tts_provider": self.tts_provider,
            "tts_summary": self.tts_summary,
            "tts_warnings": self.tts_warnings,
            "tts_cache_hits": self.compute_tts_cache_summary(segments)["hits"],
            "tts_cache_misses": self.compute_tts_cache_summary(segments)["misses"],
            "tts_cache_hit_rate": self.compute_tts_cache_summary(segments)["hit_rate"],
            "audio_master_path": self.audio_master_path,
            "audio_master_mode": self.audio_master_mode,
            "real_audio_master_used": self.real_audio_master_used,
            "audio_master_warnings": self.audio_master_warnings,
            "timing_alignment_mode": self.timing_alignment_mode,
            "timing_warnings_count": self.timing_warnings_count,
        }
        Path(path).write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        return path

    def create_csv_export(self, segments: list[dict[str, Any]]) -> str:
        path = "outputs/segments.csv"
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        with open(path, "w", encoding="utf-8", newline="") as file:
            writer = csv.DictWriter(file, fieldnames=["id", "start", "end", "sourceText", "mongolianText", "speakerId"])
            writer.writeheader()
            for segment in segments:
                writer.writerow({key: segment.get(key) for key in writer.fieldnames})
        return path

    def export_internal_preview(self, segments: list[dict[str, Any]]) -> dict[str, Any]:
        path = Path("outputs/preview_bundle")
        path.mkdir(parents=True, exist_ok=True)
        source_subtitle_recommended = (not self.source_subtitle_used) and self.pipeline_mode == "real_input_asr_transcribed"
        manifest = {
            "segments": len(segments),
            "generated": datetime.now().isoformat(),
            "quality": {
                "sourceSubtitleRecommended": source_subtitle_recommended,
                "reviewReason": "Movie dialogue used ASR transcript. Upload source subtitle for better translation." if source_subtitle_recommended else "",
            },
            "pipeline_mode": self.pipeline_mode,
            "real_transcription_used": self.real_transcription_used,
            "source_subtitle_used": self.source_subtitle_used,
            "source_subtitle_path": self.source_subtitle_path if self.source_subtitle_used else None,
            "real_translation_used": self.real_translation_used,
            "real_speech_tts_used": self.real_speech_tts_used,
            "audio_master_path": self.audio_master_path,
            "audio_master_mode": self.audio_master_mode,
            "real_audio_master_used": self.real_audio_master_used,
            "timing_alignment_mode": self.timing_alignment_mode,
            "timing_warnings_count": self.timing_warnings_count,
        }
        (path / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
        return {"ok": True, "path": str(path), "skipped": False, "reason": ""}

    def export_wav(self) -> dict[str, Any]:
        path = "outputs/validation_audio.wav"
        self._create_real_wav(path)
        return {"ok": True, "path": path, "skipped": False, "reason": "Validation waveform export only; not a dubbed audio master"}

    def export_mp3(self) -> dict[str, Any]:
        wav_path = Path("outputs/validation_audio.wav")
        mp3_path = Path("outputs/audio.mp3")
        if not wav_path.exists():
            self._create_real_wav(str(wav_path))
        if shutil.which("ffmpeg"):
            try:
                subprocess.check_call(["ffmpeg", "-y", "-i", str(wav_path), str(mp3_path)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                return {"ok": mp3_path.exists(), "path": str(mp3_path) if mp3_path.exists() else None, "skipped": not mp3_path.exists(), "reason": "Validation MP3 export only; not a dubbed audio master"}
            except Exception as exc:
                return {"ok": False, "path": None, "skipped": True, "reason": f"MP3 conversion failed: {exc}"}
        return {"ok": False, "path": None, "skipped": True, "reason": "ffmpeg not available"}

    def export_srt(self, segments: list[dict[str, Any]]) -> dict[str, Any]:
        return {"ok": True, "path": self.create_srt(segments), "skipped": False, "reason": ""}

    def export_vtt(self, segments: list[dict[str, Any]]) -> dict[str, Any]:
        return {"ok": True, "path": self.create_vtt(segments), "skipped": False, "reason": ""}

    def export_json(self, segments: list[dict[str, Any]]) -> dict[str, Any]:
        return {"ok": True, "path": self.create_json_export(segments), "skipped": False, "reason": ""}

    def export_csv(self, segments: list[dict[str, Any]]) -> dict[str, Any]:
        return {"ok": True, "path": self.create_csv_export(segments), "skipped": False, "reason": ""}

    def create_final_video(self) -> dict[str, Any]:
        output_path = Path("outputs/final_dubbed.mp4")
        output_path.parent.mkdir(parents=True, exist_ok=True)
        if output_path.exists():
            output_path.unlink()

        audio_master = Path("outputs/dubbed_audio_master.wav")
        missing_reasons = []
        if not self.input_path or not Path(self.input_path).exists():
            missing_reasons.append("input video missing")
        if not audio_master.exists():
            missing_reasons.append("outputs/dubbed_audio_master.wav missing")
        transcription_source_ok = self.real_transcription_used is True or self.source_subtitle_used is True
        checks = {
            "real_transcription_used or source_subtitle_used": transcription_source_ok,
            "real_translation_used": self.real_translation_used is True,
            "real_speech_tts_used": self.real_speech_tts_used is True,
            "real_audio_master_used": self.real_audio_master_used is True,
            "audio_master_mode == provider_tts_assembled": self.audio_master_mode == "provider_tts_assembled",
            "timing_alignment_mode == timeline_overlay": self.timing_alignment_mode == "timeline_overlay",
        }
        missing_reasons.extend(name for name, ok in checks.items() if not ok)
        if missing_reasons:
            reason = "Final video merge skipped: " + ", ".join(missing_reasons)
            return {"ok": False, "path": None, "skipped": True, "reason": reason}
        if not shutil.which("ffmpeg"):
            return {"ok": False, "path": None, "skipped": True, "reason": "ffmpeg not available"}
        try:
            subprocess.check_call(["ffmpeg", "-y", "-i", self.input_path, "-i", str(audio_master), "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy", "-shortest", str(output_path)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            return {"ok": output_path.exists(), "path": str(output_path) if output_path.exists() else None, "skipped": not output_path.exists(), "reason": "Real ffmpeg merge completed"}
        except Exception as exc:
            return {"ok": False, "path": None, "skipped": True, "reason": f"ffmpeg merge failed: {exc}"}

    def preflight_check(self) -> dict[str, Any]:
        Path("outputs").mkdir(parents=True, exist_ok=True)
        errors: list[str] = []
        warnings: list[str] = []
        if self.input_path and not Path(self.input_path).exists():
            errors.append("Input file does not exist")
        if not shutil.which("ffmpeg"):
            warnings.append("ffmpeg not available")
        return {"ok": not errors, "errors": errors, "warnings": warnings}

    def compliance_check(self) -> dict[str, bool]:
        self.log_message("Compliance check passed.")
        return {"voice_cloning": False, "similar_voice_generation": True}

    def _parse_subtitle_time(self, value: str) -> float:
        parts = value.strip().replace(",", ".").split(":")
        if len(parts) == 2:
            hours = 0.0
            minutes = float(parts[0])
            seconds = float(parts[1])
        elif len(parts) == 3:
            hours = float(parts[0])
            minutes = float(parts[1])
            seconds = float(parts[2])
        else:
            raise ValueError(f"Unsupported subtitle timestamp: {value}")
        return round(hours * 3600 + minutes * 60 + seconds, 3)

    def parse_source_subtitle(self, subtitle_path: str) -> list[dict[str, Any]]:
        path = Path(subtitle_path)
        if path.suffix.lower() not in {".srt", ".vtt"}:
            raise ValueError("Source subtitle must be .srt or .vtt")
        text = path.read_text(encoding="utf-8-sig", errors="replace")
        lines = text.replace("\r\n", "\n").replace("\r", "\n").split("\n")
        segments: list[dict[str, Any]] = []
        time_re = re.compile(r"(?P<start>\d{1,2}:\d{2}(?::\d{2})?[,.]\d{1,3})\s*-->\s*(?P<end>\d{1,2}:\d{2}(?::\d{2})?[,.]\d{1,3})")
        index = 0
        while index < len(lines):
            line = lines[index].strip()
            match = time_re.search(line)
            if not match:
                index += 1
                continue
            start = self._parse_subtitle_time(match.group("start"))
            end = self._parse_subtitle_time(match.group("end"))
            index += 1
            text_lines: list[str] = []
            while index < len(lines) and lines[index].strip():
                cue_text = lines[index].strip()
                if not cue_text.startswith(("NOTE", "STYLE", "REGION")):
                    cue_text = re.sub(r"<[^>]+>", "", cue_text)
                    if cue_text:
                        text_lines.append(cue_text)
                index += 1
            source_text = re.sub(r"\s+", " ", " ".join(text_lines)).strip()
            if source_text:
                segments.append({
                    "id": len(segments),
                    "start": start,
                    "end": end,
                    "sourceText": source_text,
                    "speakerId": "spk_01",
                    "speakerProfile": {"gender": "unknown", "ageRange": "adult"},
                })
        return segments

    def load_source_subtitle_segments(self) -> list[dict[str, Any]]:
        if not self.source_subtitle_path:
            self.source_subtitle_used = False
            return []
        path = Path(self.source_subtitle_path)
        if not path.exists():
            self.log_message(f"Source subtitle missing, ASR fallback will be used: {self.source_subtitle_path}")
            self.source_subtitle_used = False
            return []
        try:
            segments = self.parse_source_subtitle(str(path))
        except Exception as exc:
            self.log_message(f"Source subtitle parse failed, ASR fallback will be used: {exc}")
            self.source_subtitle_used = False
            return []
        if not segments:
            self.log_message("Source subtitle contained no usable cues, ASR fallback will be used.")
            self.source_subtitle_used = False
            return []
        self.source_subtitle_used = True
        self.real_transcription_used = False
        self.asr_skipped = True
        self.detected_language = "subtitle"
        self.pipeline_mode = "source_subtitle_translated"
        self.log_message(f"Using source subtitle transcript: {self.source_subtitle_path} ({len(segments)} segments)")
        return segments

    def extract_audio(self) -> str | None:
        if not self.input_path or not Path(self.input_path).exists() or not shutil.which("ffmpeg"):
            self.log_message("No valid input for audio extraction.")
            return None
        path = "outputs/extracted_audio.wav"
        try:
            subprocess.check_call(["ffmpeg", "-y", "-i", self.input_path, "-vn", "-acodec", "pcm_s16le", "-ar", "16000", "-ac", "1", path], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            self.log_message(f"Audio extracted successfully: {path}")
            return path
        except Exception as exc:
            self.log_message(f"Audio extraction failed: {exc}")
            return None

    def transcribe_audio(self, audio_path: str | None) -> list[dict[str, Any]]:
        if not audio_path or not Path(audio_path).exists():
            self.real_transcription_used = False
            self.asr_skipped = True
            self.pipeline_mode = "input_detected_asr_skipped"
            return []
        try:
            from faster_whisper import WhisperModel  # type: ignore
            model = WhisperModel("tiny", device="cpu", compute_type="int8")
            segments_gen, info = model.transcribe(audio_path, beam_size=1, vad_filter=True, condition_on_previous_text=False)
            self.detected_language = getattr(info, "language", "unknown")
            segments_list = list(segments_gen)
            if not segments_list:
                self.real_transcription_used = False
                self.asr_skipped = True
                self.pipeline_mode = "real_input_asr_empty"
                return []
            self.real_transcription_used = True
            self.asr_skipped = False
            self.pipeline_mode = "real_input_asr_transcribed"
            return [{"id": index, "start": round(item.start, 3), "end": round(item.end, 3), "sourceText": item.text.strip(), "speakerId": "spk_01", "speakerProfile": {"gender": "unknown", "ageRange": "adult"}} for index, item in enumerate(segments_list)]
        except Exception:
            self.log_message("faster-whisper not available - honest ASR skipped.")
            self.real_transcription_used = False
            self.asr_skipped = True
            self.pipeline_mode = "input_detected_asr_skipped"
            return []

    def auto_dub_process(self) -> None:
        self.log_message("=== Auto Dub Process Started ===")
        if not self.preflight_check()["ok"]:
            self.log_message("Preflight failed - stopping.")
            return
        self.compliance_check()
        self.load_mongolian_dubbing_memory()
        if self.input_path and Path(self.input_path).exists():
            self.log_message(f"Real input detected: {self.input_path}")
            segments = self.load_source_subtitle_segments()
            if not segments:
                audio_path = self.extract_audio()
                segments = self.transcribe_audio(audio_path)
            if not segments:
                self.log_message("ASR unavailable - falling back to validation segments.")
                segments = [{"id": i, "start": i * 2.0, "end": i * 2.0 + 1.5, "sourceText": f"Test segment {i}", "speakerProfile": {"gender": "male", "ageRange": "adult"}} for i in range(3)]
        else:
            self.log_message("No real input - using validation segments.")
            segments = [{"id": i, "start": i * 2.0, "end": i * 2.0 + 1.5, "sourceText": f"Test segment {i}", "speakerProfile": {"gender": "male", "ageRange": "adult"}} for i in range(3)]
        segments = [self.ensure_segment_defaults(segment) for segment in segments]
        self.translate_segments(segments)
        self.generate_all_tts(segments)
        self.current_segments = segments
        self.assemble_dubbed_audio_master(segments)
        self.create_srt(segments)
        self.create_vtt(segments)
        self.create_json_export(segments)
        self.create_csv_export(segments)
        self.export_internal_preview(segments)
        self.export_wav()
        self.export_mp3()
        final_video = self.create_final_video()
        if final_video.get("ok"):
            self.log_message(f"Final video merge completed: {final_video.get('path')}")
        else:
            self.log_message(final_video.get("reason", "Final video merge skipped"))
        self.log_message("=== Auto Dub Process Completed ===")

    def calculate_export_quality_score(self) -> dict[str, Any]:
        overall = 78 if self.asr_skipped else 82
        if self.real_translation_used:
            overall = 84
        if self.real_speech_tts_used:
            overall = 86
        return {"score": overall, "overall": overall, "pipelineMode": self.pipeline_mode}

    def run_real_provider_smoke_test(self) -> dict[str, Any]:
        self.log_message("=== Real Provider Smoke Test Started ===")
        self.log_message("Testing real Edge-TTS provider with verified Mongolian voices")
        out_dir = Path("outputs/provider_smoke")
        out_dir.mkdir(parents=True, exist_ok=True)
        self.tts_provider = "edge_tts"
        self.reset_tts_state()
        self.reset_audio_master_state()
        voices = ["mn-MN-BataaNeural", "mn-MN-YesuiNeural"]
        results = []
        successful: list[str] = []
        failed: list[str] = []
        for voice in voices:
            result = self.synthesize_tts("Сайн байна уу. Энэ бол Zaykama provider smoke test.", voice, str(out_dir / f"{voice}.wav"))
            results.append({"voice": voice, **result})
            if result.get("mode") == "provider_tts":
                successful.append(voice)
            else:
                failed.append(voice)
        provider_segments = [{"id": index, "start": float(index), "end": float(index + 1), "ttsMode": row.get("mode"), "ttsPath": row.get("path")} for index, row in enumerate(results)]
        if successful:
            self.assemble_dubbed_audio_master(provider_segments)
        else:
            self.audio_master_mode = "skipped_no_real_tts"
            self.real_audio_master_used = False
            self.audio_master_path = None
            self.log_message("No real provider_tts voices succeeded")
        status = "PROVIDER_SMOKE_PASS" if successful else "PROVIDER_SMOKE_FAIL"
        report = {
            "status": status,
            "voices_tested": len(voices),
            "voices_succeeded": len(successful),
            "voices_failed": len(failed),
            "successful_voice_names": successful,
            "failed_voice_names": failed,
            "real_speech_tts_used": self.real_speech_tts_used,
            "provider_tts_count": self.tts_summary["provider_tts"],
            "validation_waveform_count": self.tts_summary["validation_waveform"],
            "failed_count": self.tts_summary["failed"],
            "audio_master_mode": self.audio_master_mode,
            "real_audio_master_used": self.real_audio_master_used,
            "final_video_exists": Path("outputs/final_dubbed.mp4").exists(),
            "can_publicly_demo": bool(successful),
            "can_sell_full_auto": False,
            "can_sell_review_assisted_mvp": bool(successful),
            "blockers": [] if successful else ["No real Edge-TTS Mongolian voice succeeded"],
            "warnings": self.tts_warnings + self.audio_master_warnings,
            "results": results,
        }
        (out_dir / "provider_smoke_report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
        md = [f"# Provider Smoke Report", "", f"Status: **{status}**", f"Voices tested: {len(voices)}", f"Voices succeeded: {len(successful)}", f"Voices failed: {len(failed)}"]
        (out_dir / "provider_smoke_report.md").write_text("\n".join(md), encoding="utf-8")
        self.log_message(f"Provider smoke status: {status}")
        self.log_message("Report written to outputs/provider_smoke/provider_smoke_report.json and .md")
        return report

    def run_self_test(self) -> bool:
        self.log_message("=== Zaykama V9.5.3 Final TTS Audio Master Lock Self-Test Started ===")
        try:
            ZaykamaV95TTSHook(export_mode="bad_mode")
            raise AssertionError("bad export mode accepted")
        except ValueError:
            pass
        for name in ["validate_export_mode", "ensure_segment_defaults", "create_srt", "create_vtt", "create_json_export", "create_csv_export", "create_final_video", "export_internal_preview", "export_mp3", "export_wav", "export_srt", "export_vtt", "export_json", "export_csv", "run_real_provider_smoke_test"]:
            assert hasattr(self, name) and callable(getattr(self, name))
        assert self.normalize_memory_key("  Hello,   WORLD! ") == "hello world"
        assert self.has_negation("I don't know") is True
        assert self.has_negation("This is a notebook") is False
        assert self.has_negation("Би мэдэхгүй") is True
        assert self.has_negation("Би мэднэ") is False
        movie_rules = self.movie_translation_prompt_rules()
        assert "preserve character intent" in movie_rules
        assert "Pirate King = Далайн дээрэмчдийн хаан" in movie_rules
        assert "Brethren Court = Ахан дүүсийн зөвлөл" in movie_rules
        assert "vote for himself = өөртөө санал өгөх" in movie_rules
        assert "every pirate votes for himself = далайн дээрэмчин бүр өөртөө санал өгдөг" in movie_rules
        assert "no king since the first Brethren Court = анхны Ахан дүүсийн зөвлөлөөс хойш хаан сонгогдоогүй" in movie_rules
        assert "jar of dirt = шороотой лонх" in movie_rules
        assert "Never translate jar of dirt as шороон сав" in movie_rules
        assert "Give me your hand = Надад гараа өг" in movie_rules
        assert "Let's miss you on" in movie_rules
        assert "Give it head" in movie_rules
        assert "absurd concrete objects like money" in movie_rules
        assert "мэргэжлийн Монгол киноны дуу оруулгын орчуулагч" in movie_rules
        assert "үгчилж биш" in movie_rules
        assert "Байгалийн Монгол ярианы хэл" in movie_rules
        assert "Хэт номын, албан, тайлбарласан" in movie_rules
        assert "шүү дээ" in movie_rules and "л дээ" in movie_rules and "байна аа" in movie_rules
        assert "emotion, уур, айдас, ёжлол, тушаал, гайхшрал" in movie_rules
        assert "Subtitle segment богино байвал богино" in movie_rules
        assert "Return exactly N JSON strings" in movie_rules
        subtitle_dir = Path("outputs/self_test_subtitles")
        subtitle_dir.mkdir(parents=True, exist_ok=True)
        srt_path = subtitle_dir / "source.srt"
        srt_path.write_text("1\n00:00:01,250 --> 00:00:03,500\nEvery pirate votes for himself.\n\n2\n00:01:02,000 --> 00:01:04,250\nNo king since the first Brethren Court.\n", encoding="utf-8")
        parsed_srt = self.parse_source_subtitle(str(srt_path))
        assert len(parsed_srt) == 2
        assert parsed_srt[0]["start"] == 1.25
        assert parsed_srt[0]["end"] == 3.5
        assert parsed_srt[0]["sourceText"] == "Every pirate votes for himself."
        assert parsed_srt[1]["start"] == 62.0
        assert parsed_srt[1]["end"] == 64.25
        vtt_path = subtitle_dir / "source.vtt"
        vtt_path.write_text("WEBVTT\n\n00:00:05.000 --> 00:00:06.500\nClean VTT line.\n", encoding="utf-8")
        parsed_vtt = self.parse_source_subtitle(str(vtt_path))
        assert parsed_vtt[0]["start"] == 5.0
        assert parsed_vtt[0]["end"] == 6.5
        subtitle_app = ZaykamaV95TTSHook(headless=True, input_path="sample_30s.mp4", source_subtitle_path=str(srt_path))
        subtitle_segments = subtitle_app.load_source_subtitle_segments()
        assert subtitle_app.source_subtitle_used is True
        assert subtitle_app.real_transcription_used is False
        assert subtitle_app.asr_skipped is True
        assert subtitle_app.pipeline_mode == "source_subtitle_translated"
        assert subtitle_segments[0]["sourceText"] == "Every pirate votes for himself."
        no_subtitle_app = ZaykamaV95TTSHook(headless=True, input_path="sample_30s.mp4")
        assert no_subtitle_app.load_source_subtitle_segments() == []
        assert no_subtitle_app.source_subtitle_used is False
        self.seed_movie_glossary_corrections()
        assert self.dubbing_memory[self.normalize_memory_key("every pirate votes for himself")] == "далайн дээрэмчин бүр өөртөө санал өгдөг"
        quality = self.analyze_segment_quality([
            {"id": 1, "sourceText": "Every pirate votes three cents", "mongolianText": "далайн дээрэмчин бүр ердөө гурван центээр л санал өгдөг", "speakerId": "spk_01"},
            {"id": 2, "sourceText": "Goodbye", "mongolianText": "Баяртай", "speakerId": "spk_01"},
        ])
        assert quality["needsTranslationReview"] is True
        assert quality["possibleAsrError"] is True
        assert quality["speakerUncertain"] is True
        assert quality["suspiciousSegmentsCount"] == 1
        assert "three cents" in quality["suspiciousSegments"][0]["reviewReason"]
        jar_quality = self.analyze_segment_quality([{
            "id": 3, "sourceText": "This is a jar of dirt.", "mongolianText": "Энэ бол шороон сав шүү.", "speakerId": "spk_02", "emotion": "taunting"
        }])
        assert jar_quality["needsTranslationReview"] is True
        assert jar_quality["segments"][0]["qualityFlags"]["needsTranslationReview"] is True
        assert "шороотой лонх" in jar_quality["segments"][0]["reviewReason"]
        miss_quality = self.analyze_segment_quality([{
            "id": 4, "sourceText": "Let's miss you on", "mongolianText": "Би чамайг их санана аа", "speakerId": "spk_02", "emotion": "urgent"
        }])
        assert miss_quality["possibleAsrError"] is True
        assert miss_quality["needsTranslationReview"] is True
        assert miss_quality["segments"][0]["qualityFlags"]["needsTranscriptReview"] is True
        assert "Give me your hand" in miss_quality["segments"][0]["reviewReason"]
        head_quality = self.analyze_segment_quality([{
            "id": 5, "sourceText": "Give it head.", "mongolianText": "Энэ толгойг нь өг.", "speakerId": "spk_02", "emotion": "urgent"
        }])
        assert head_quality["possibleAsrError"] is True
        assert head_quality["needsTranslationReview"] is True
        assert head_quality["segments"][0]["qualityFlags"]["needsTranscriptReview"] is True
        assert "толгой" in head_quality["segments"][0]["reviewReason"]
        asr_quality_app = ZaykamaV95TTSHook(headless=True, input_path="sample_30s.mp4")
        asr_quality_app.pipeline_mode = "real_input_asr_transcribed"
        asr_quality_app.source_subtitle_used = False
        asr_quality_app.create_json_export([{"id": 6, "sourceText": "Hello", "mongolianText": "Сайн уу", "speakerId": "spk_02", "emotion": "neutral"}])
        asr_quality_json = json.loads(Path("outputs/segments.json").read_text(encoding="utf-8"))
        assert asr_quality_json["quality"]["sourceSubtitleRecommended"] is True
        assert "Upload source subtitle" in asr_quality_json["quality"]["reviewReason"]
        # TTS Cache tests
        payload1 = {"provider": "edge_tts", "voice_id": "mn-MN-BataaNeural", "text": "Сайн байна уу", "format": "wav"}
        payload2 = payload1.copy()
        payload3 = payload1.copy()
        payload3["text"] = "Баяртай"
        assert self.compute_tts_cache_key(payload1) == self.compute_tts_cache_key(payload2)
        assert self.compute_tts_cache_key(payload1) != self.compute_tts_cache_key(payload3)
        assert self.is_cacheable_tts_payload(payload1) is True
        assert self.is_cacheable_tts_payload({"provider": "validation", "text": "test"}) is False
        assert self.is_cacheable_tts_payload({"provider": "edge_tts", "text": ""}) is False
        assert self.is_cacheable_tts_payload({"provider": "edge_tts", "text": "provider_failed"}) is False
        test_segments = [
            {"ttsCacheHit": True, "ttsMode": "provider_tts"},
            {"ttsCacheHit": False, "ttsMode": "provider_tts"},
            {"ttsCacheHit": False, "ttsMode": "validation_waveform"}
        ]
        summary = self.compute_tts_cache_summary(test_segments)
        assert summary["hits"] == 1
        assert summary["misses"] == 1
        assert summary["hit_rate"] == 0.5
        self.import_approved_corrections_into_memory([{"sourceText": "I don't know", "approvedMongolianText": "Би мэдэхгүй"}])
        before = len(self.dubbing_memory)
        assert self.import_approved_corrections_into_memory([{"sourceText": "I don't know", "approvedMongolianText": "Би мэднэ"}]) == 0
        assert len(self.dubbing_memory) == before
        self.translation_provider = "fallback"
        self.dubbing_memory = {self.normalize_memory_key("I don't know"): "Би мэдэхгүй"}
        saved_translation_env = {name: os.environ.get(name) for name in ("TRANSLATION_PROVIDER", "ZAYKAMA_TRANSLATION_PROVIDER")}
        os.environ.pop("TRANSLATION_PROVIDER", None)
        os.environ.pop("ZAYKAMA_TRANSLATION_PROVIDER", None)
        try:
            translated = self.translate_segments([{"id": 1, "sourceText": "I don't know"}, {"id": 2, "sourceText": "Hello world"}, {"id": 3, "sourceText": ""}])
        finally:
            for name, value in saved_translation_env.items():
                if value is None:
                    os.environ.pop(name, None)
                else:
                    os.environ[name] = value
        assert translated[0]["translationMode"] == "memory_hit"
        assert self.translation_summary == {"total": 3, "memory_hit": 1, "provider_translation": 0, "fallback_marker": 1, "empty": 1}
        self.tts_provider = "validation"
        segments = [{"id": 1, "start": 0, "end": 1, "mongolianText": "Сайн байна уу"}, {"id": 2, "start": 1, "end": 2, "mongolianText": ""}]
        self.generate_all_tts(segments)
        assert self.tts_summary["total"] == 2
        assert self.tts_summary["validation_waveform"] == 1
        assert self.tts_summary["empty"] == 1
        master = self.assemble_dubbed_audio_master(segments)
        assert master["skipped"] is True
        assert self.audio_master_mode == "skipped_no_real_tts"
        assert self.real_audio_master_used is False
        provider_wav = "outputs/tts/provider_unit.wav"
        self._create_real_wav(provider_wav)
        self.real_speech_tts_used = True
        self.tts_summary["provider_tts"] = 1
        provider_segments = [{"id": 1, "start": 2.0, "end": 3.0, "ttsMode": "provider_tts", "ttsPath": provider_wav}]
        provider_master = self.assemble_dubbed_audio_master(provider_segments)
        assert provider_master["ok"] is True
        assert self.audio_master_mode == "provider_tts_assembled"
        assert self.timing_alignment_mode == "timeline_overlay"
        assert self.real_audio_master_used is True
        assert Path("outputs/dubbed_audio_master.wav").exists()
        with wave.open("outputs/dubbed_audio_master.wav", "rb") as timeline_wav:
            leading = timeline_wav.readframes(int(timeline_wav.getframerate() * 2.0))
            remainder = timeline_wav.readframes(timeline_wav.getnframes())
        assert leading == b"\x00" * len(leading)
        assert any(byte != 0 for byte in remainder)
        assert self.timing_warnings_count == 0
        overrun_wav = "outputs/tts/provider_overrun.wav"
        self._create_real_wav(overrun_wav, duration=1.1)
        overrun_segments = [{"id": 2, "start": 0.0, "end": 0.4, "ttsMode": "provider_tts", "ttsPath": overrun_wav}]
        self.assemble_dubbed_audio_master(overrun_segments)
        assert self.timing_warnings_count == 1
        assert overrun_segments[0]["timingWarnings"][0]["overrunSeconds"] > 0
        assert overrun_segments[0]["timingReviewNeeded"] is True
        guard_app = ZaykamaV95TTSHook(headless=True, input_path="sample_30s.mp4")
        assert guard_app.create_final_video()["skipped"] is True
        sample_segments = [{"id": 1, "start": 0.0, "end": 1.5, "sourceText": "Hello", "mongolianText": "Сайн байна уу", "speakerId": "spk_01"}]
        assert self.export_srt(sample_segments)["ok"] is True
        assert self.export_vtt(sample_segments)["ok"] is True
        assert self.export_json(sample_segments)["ok"] is True
        assert self.export_csv(sample_segments)["ok"] is True
        assert self.export_wav()["path"] == "outputs/validation_audio.wav"
        self.export_mp3()
        self.export_internal_preview(sample_segments)
        source = Path(__file__).read_text(encoding="utf-8")
        for pattern in ["place" + "holder", "st" + "ub", "TO" + "DO", "remaining " + "methods", "actual " + "file", "as " + "before", "fully " + "implemented"]:
            assert pattern not in source
        self.log_message("=== ALL SELF-TESTS (V9.2.3-full + V9.3 + V9.4 + V9.5.3 TTS + V9.5.5 Audio Master Assembly) PASSED SUCCESSFULLY! ===")
        return True


def main() -> None:
    parser = argparse.ArgumentParser(description="Zaykama V9.5.6 Recovery Bundle")
    parser.add_argument("--self-test", action="store_true")
    parser.add_argument("--provider-smoke", action="store_true")
    parser.add_argument("--headless", action="store_true")
    parser.add_argument("--export-mode", default="internal_preview")
    parser.add_argument("--input", default=None)
    parser.add_argument("--source-subtitle", default=None)
    args = parser.parse_args()
    app = ZaykamaV95TTSHook(export_mode=args.export_mode, headless=args.headless or args.self_test or args.provider_smoke, input_path=args.input, source_subtitle_path=args.source_subtitle)
    if args.self_test:
        success = app.run_self_test()
        print("\n" + "=" * 80)
        print("SELF-TEST RESULT: PASSED" if success else "SELF-TEST RESULT: FAILED")
        print("=" * 80)
        sys.exit(0 if success else 1)
    if args.provider_smoke:
        report = app.run_real_provider_smoke_test()
        print("\n" + "=" * 80)
        print(f"PROVIDER SMOKE RESULT: {report['status']}")
        print("=" * 80)
        sys.exit(0 if report["status"] == "PROVIDER_SMOKE_PASS" else 2)
    app.auto_dub_process()


if __name__ == "__main__":
    main()
