# Zaykama Next Tasks

## Current stable state

- Zaykama is a working draft Mongolian dubbing pipeline.
- Gemini translation works.
- Basic Mongolian TTS works.
- Final MP4 generation works in the current draft pipeline.
- `movie_review` requires source subtitle `.srt` / `.vtt`.
- `quick_demo` remains ASR-only testing.

## Main product direction

Build Zaykama into a review-assisted Mongolian dubbing studio with subtitle-driven translation, natural Mongolian dubbing adaptation, manual review, voice assignment, emotion annotation, persistent TTS caching, and efficient segment regeneration.

## Task 1: Subtitle auto-fetch/extract

Add safe subtitle discovery/extraction so movie review flows can obtain source `.srt` / `.vtt` when available, while still requiring source subtitles for production-quality review.

## Task 2: Persistent TTS cache

Add persistent TTS caching so already-approved segments do not need to be regenerated unless text, voice, emotion, or timing-critical settings change.

## Task 3: Manual character / voice / emotion annotation

Add manual controls for character, similar voice assignment, emotion annotation, and review status per segment.

## Priority order

1. Push current working project to GitHub
2. Create stable tag
3. Subtitle auto-fetch/extract
4. Persistent TTS cache
5. Manual character/voice/emotion annotation
6. Segment editor
7. Regenerate TTS only for edited segments
8. 20+6 voice library
