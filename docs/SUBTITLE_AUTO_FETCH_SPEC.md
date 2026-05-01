# Subtitle Auto-Fetch/Extract Spec

## Summary

Add safe subtitle discovery, fetch, and embedded-subtitle extraction for Zaykama movie review flows so source `.srt` / `.vtt` subtitles can be obtained when available without weakening the production-quality requirement for source subtitles.

This is a product specification only. It does not change the current pipeline behavior by itself.

## Goals

- Reduce friction when a reviewer has a video URL or a video file that already has usable subtitles.
- Prefer high-quality human-authored or embedded subtitle tracks over ASR for `movie_review` mode.
- Preserve the current distinction between:
  - `movie_review`: source-subtitle-driven review and dubbing workflow.
  - `quick_demo`: ASR-only testing/demo workflow.
- Make subtitle provenance visible so reviewers know whether subtitles were uploaded, embedded, URL-fetched, or unavailable.
- Keep the system safe, explicit, and review-oriented; auto-fetch/extract should assist the reviewer, not silently lower quality.

## Non-Goals

- Do not add subtitle auto-translation from arbitrary languages as part of this feature.
- Do not use ASR as a hidden replacement for source subtitles in `movie_review`.
- Do not bypass manual review, character assignment, emotion annotation, or future segment approval workflows.
- Do not clone or impersonate voices.
- Do not change TTS generation, timing stretch logic, or `zaykama_v9_5_tts_hook.py` as part of the subtitle discovery feature.

## Definitions

- User-uploaded subtitle: A `.srt` or `.vtt` file explicitly uploaded by the user with the job.
- Embedded subtitle: A subtitle track contained inside the uploaded media container, such as Matroska, MP4, or MOV subtitle streams.
- URL-fetched subtitle: A subtitle file or caption track discovered and downloaded from a supported URL source.
- Auto-extracted subtitle: A subtitle file produced by extracting an embedded subtitle stream from the uploaded media.
- Source subtitle: The selected subtitle file used as the source transcript for review, translation, and dubbing.
- ASR transcript: Speech recognition output generated from audio. ASR remains suitable for `quick_demo`, but not as the quality baseline for `movie_review`.

## User Stories

1. As a reviewer, I can upload a video with embedded subtitles and have Zaykama extract a source `.srt` / `.vtt` candidate automatically.
2. As a reviewer, I can provide a supported URL and have Zaykama attempt to discover a caption/subtitle track.
3. As a reviewer, I can still upload my own `.srt` / `.vtt`, and it always wins over automatically discovered sources.
4. As a reviewer, I can see the selected subtitle provenance before the job proceeds.
5. As a reviewer, if no acceptable source subtitle is found for `movie_review`, I get a clear message telling me to upload `.srt` / `.vtt` or use `quick_demo`.

## Product Behavior

### Input Sources

The job creation flow may receive one or more of:

- Uploaded video/audio media.
- Explicit user-uploaded `.srt` / `.vtt` source subtitle.
- URL pointing to a supported media or caption source.

### Discovery Order

The system should evaluate candidate subtitle sources in this order:

1. User-uploaded subtitle.
2. Embedded subtitle tracks in uploaded media.
3. URL-fetched subtitle or caption tracks.

When a higher-priority candidate exists and passes validation, lower-priority candidates must not replace it.

### Supported Subtitle Formats

Initial supported source subtitle formats:

- `.srt`
- `.vtt`

Optional future formats may be converted into `.srt` / `.vtt` only if conversion is deterministic and validation passes.

### Embedded Subtitle Extraction

When the uploaded media may contain embedded subtitles:

- Probe subtitle streams without modifying the original media.
- Prefer text subtitle streams over image-based subtitle streams for the initial version.
- Convert extractable text streams to `.srt` or `.vtt`.
- Preserve language metadata when available.
- Store extracted subtitle artifacts in the job input directory with clear provenance metadata.
- If multiple subtitle tracks are present, choose the best default candidate and expose enough metadata for later manual selection.

Suggested preference for multiple embedded tracks:

1. Track explicitly marked as default/forced when appropriate for source dialogue.
2. Track language matching user-selected/source language, when available.
3. First valid text subtitle track.

### URL Subtitle Fetching

When a URL is provided:

- Only fetch from supported providers or direct subtitle/caption URLs.
- Enforce file size and timeout limits.
- Accept only validated `.srt` / `.vtt` output into the source subtitle path.
- Record URL provenance without storing sensitive tokens in metadata.
- Fail closed: if fetching is unsupported, blocked, too large, or invalid, continue to the next allowed path or show a clear message.

### Validation

Every subtitle candidate must pass validation before it can become the source subtitle:

- Extension or detected output format is `.srt` or `.vtt`.
- File is non-empty.
- File contains parseable cues.
- Cue timings are monotonically valid enough for review.
- Text content is present.
- File size is within configured limits.

Invalid candidates should be rejected with a specific reason in job metadata/logs.

## Mode Rules

### movie_review

- Requires a valid source subtitle.
- Can satisfy the source subtitle requirement through:
  - user-uploaded subtitle,
  - embedded subtitle extraction,
  - URL-fetched subtitle.
- Must not silently fall back to ASR when no valid source subtitle is available.
- If no valid source subtitle is available, job creation should fail before starting expensive processing.
- Error messaging should recommend uploading `.srt` / `.vtt` or using `quick_demo` for ASR-only testing.

### quick_demo

- May proceed without a source subtitle.
- May use ASR-only behavior for testing/demo.
- May still use an uploaded, embedded, or URL-fetched subtitle if provided and valid, but should not require one.

## Metadata

Job metadata should make subtitle provenance explicit. Suggested fields:

- `sourceSubtitleProvided`: boolean
- `sourceSubtitlePath`: selected local source subtitle path, if any
- `sourceSubtitleProvenance`: `uploaded`, `embedded`, `url_fetched`, or `none`
- `sourceSubtitleOriginalName`: original uploaded filename, embedded stream label, or URL-derived label when safe
- `sourceSubtitleLanguage`: detected or declared language, when available
- `sourceSubtitleCandidates`: list of discovered candidates with validation status and rejection reasons
- `sourceSubtitleSelectionReason`: explanation for selected candidate

Do not store secrets, signed URL tokens, cookies, or credentials in metadata.

## UI Requirements

The job creation UI should:

- Show that `movie_review` requires a source subtitle.
- Explain that the system can try embedded extraction or URL fetch when supported.
- Show selected subtitle provenance after discovery.
- Show clear failure messages when no valid subtitle is available.
- Keep `quick_demo` available as the ASR-only path.

Recommended user-facing wording:

- `movie_review requires a source subtitle (.srt/.vtt). Upload one, use media with embedded subtitles, provide a supported subtitle URL, or switch to quick_demo for ASR-only testing.`

## Safety and Reliability

- Use strict file type validation before parsing.
- Limit network fetch size, redirects, and duration.
- Avoid shell injection risks when probing/extracting media paths.
- Keep extracted/fetched artifacts inside the job directory.
- Do not overwrite user-uploaded subtitles with discovered candidates.
- Log failures as non-fatal discovery errors unless `movie_review` has no valid source subtitle.

## Acceptance Criteria

- `movie_review` can start when the user uploads a valid `.srt` / `.vtt` source subtitle.
- `movie_review` can start when no subtitle is uploaded but a valid embedded subtitle is extracted from the uploaded media.
- `movie_review` can start when no uploaded or embedded subtitle exists but a valid URL-fetched `.srt` / `.vtt` subtitle is available.
- `movie_review` is rejected before job start when no valid uploaded, embedded, or URL-fetched source subtitle is available.
- `quick_demo` still allows missing source subtitles for ASR-only testing.
- Strict precedence: user-uploaded subtitle > embedded subtitle > URL-fetched subtitle.
- The selected source subtitle path and provenance are stored in job metadata.
- Invalid subtitle candidates are rejected with clear reasons and do not become the source subtitle.
- The UI clearly explains how to satisfy the subtitle requirement and when to use `quick_demo`.
- Existing pipeline code, tests, and TTS hook behavior are unchanged by this docs-only spec.

## Open Questions

- Which URL providers should be supported in the first implementation?
- Should the first version allow manual selection among multiple embedded subtitle tracks?
- Which source-language preference should be default when language metadata is missing?
- Should image-based subtitle streams be rejected initially or queued for future OCR support?
- What maximum subtitle file size should be enforced per job?
