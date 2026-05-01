# Zaykama Project Memory

## Stable project facts

- Zaykama is a review-assisted Mongolian dubbing studio.
- `movie_review` requires source subtitle `.srt` / `.vtt` input.
- `quick_demo` is ASR-only testing.
- Gemini translation works.
- Basic Mongolian TTS works.
- Final MP4 generation works in the current draft pipeline.
- Production dubbing needs a segment editor, voice assignment, emotion annotation, and persistent TTS cache.
- The project has a 20+6 voice bank plan.
- GitHub repo is the source of truth.

## Voice policy

- Use similar voice assignment based on age/gender/timbre/energy/emotion.
- Do not clone or impersonate a real person without explicit permission.
- Similar voice assignment is allowed; unauthorized voice cloning is not.

## Agent roles

- ChatGPT handles architecture, prompt, and review.
- OpenClaw, Copilot, and Hermes write small patches.
- Claude handles schema and long-context analysis.

## Workflow rules

- One task = one branch/PR.
- Do not replace `zaykama_v9_5_tts_hook.py`; minimal patch only.
- Use the 3-stage translation pipeline for Mongolian dubbing.

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
