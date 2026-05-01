# Mongolian Dubbing Style Guide

## Core principle

Translation is dubbing script adaptation, not literal text translation.

- Use natural spoken Mongolian.
- Preserve meaning, emotion, intent, and tone.
- Keep lines short and easy for TTS/dubbing.
- Use previous/current/next segment context.
- If ASR text looks suspicious, flag it instead of translating blindly.

## 3-stage Mongolian dubbing translation pipeline

### Stage 1 — Context-aware draft translation

- Use full transcript context.
- Use previous/current/next segment.
- Consider speaker, situation, tone, emotion, and segment duration.
- Produce `draftMongolianText`.

### Stage 2 — Mongolian dubbing editor rewrite

- Rewrite into natural spoken Mongolian.
- Avoid literal/stiff/formal translation.
- Preserve meaning, emotion, and intent.
- Compress naturally if the segment duration is short.
- Produce `editorMongolianText`.

### Stage 3 — QA / timing / risk check

- Check forbidden phrases.
- Flag suspicious ASR phrases instead of translating blindly.
- Flag `tooLiteral`, `tooLong`, `needsReview`.
- Produce final `mongolianText` for TTS.

## Segment metadata plan

- `draftMongolianText`
- `editorMongolianText`
- `mongolianText`
- `translationStage`
- `translationReviewApplied`
- `translationReviewReason`
- `translationTooLiteral`
- `translationTooLong`
- `translationNeedsReview`
- `emotion`
- `style`
- `delivery`
- `speakerId`
- `characterId`
- `voiceId`
- `providerVoiceId`
- `voiceAssignmentMode`
- `ttsCacheKey`
- `ttsCacheHit`
- `ttsCachedPath`

## Emotion/style marker plan

- neutral
- calm
- sad
- angry
- excited
- fearful
- whisper
- laughing
- smiling
- serious
- dramatic
- soft
- firm
- reassuring

## Delivery marker plan

- pace: slow / normal / fast
- emphasis words
- `pauseBeforeMs`
- `pauseAfterMs`

## TTS cache plan

Cache key includes provider, providerVoiceId, final mongolianText, emotion, style, delivery pace, rate/speed, and output format.

## Voice policy

- Use similar voice assignment based on age/gender/timbre/energy/emotion.
- Do not clone or impersonate a real person without explicit permission.

## Required examples

- `jar of dirt` = `шороотой лонх`
- forbid: `шороон сав`
- `Your dog will be fine` = `Нохой чинь зүгээр ээ`
- forbid: `Чиний нохой сайн байх болно`
- `Do not clock out` = `Одоо битгий тараарай`
- `Give me your hand` = `Надад гараа өг`
- `Let’s miss you on` is likely ASR error.
- `Give it head` is likely ASR error.
