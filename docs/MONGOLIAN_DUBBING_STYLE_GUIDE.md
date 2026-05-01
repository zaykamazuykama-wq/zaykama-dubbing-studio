# Mongolian Dubbing Style Guide

## Core principle

Translation is dubbing script adaptation, not literal text translation.

- Use natural spoken Mongolian.
- Preserve meaning, emotion, intent, and tone.
- Keep lines short and easy for TTS/dubbing.
- Use previous/current/next segment context.
- If ASR text looks suspicious, flag it instead of translating blindly.

## Two-pass translation pipeline

full transcript context builder
→ Gemini draft translation
→ Mongolian dubbing editor QA/rewrite pass
→ QA detector
→ final Mongolian text
→ TTS duration check
→ concise rewrite if too long
→ TTS

## Required examples

- `jar of dirt` = `шороотой лонх`
- forbid: `шороон сав`
- `Your dog will be fine` = `Нохой чинь зүгээр ээ`
- forbid: `Чиний нохой сайн байх болно`
- `Do not clock out` = `Одоо битгий тараарай`
- `Give me your hand` = `Надад гараа өг`
- `Let’s miss you on` is likely ASR error.
- `Give it head` is likely ASR error.
