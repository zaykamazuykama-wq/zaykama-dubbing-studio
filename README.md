> **LEGACY REPOSITORY — DO NOT START NEW DEVELOPMENT HERE**
>
> Canonical project: `zaykamazuykama-wq/mongolian-voice-api`.
> Useful functionality is being consolidated there under PR #40 / Issue #41. Keep this repository only for migration/history until retirement verification is complete.

# Zaykama Dubbing Studio

Status: **DubMN memory / QA source repo**

This repository stores the Mongolian dubbing quality brain used by the canonical app repo:

- Canonical app repo: `zaykamazuykama-wq/mongol-dub-genie`
- Source memory repo: `zaykamazuykama-wq/zaykama-dubbing-studio`

## Purpose

`zaykama-dubbing-studio` is not the main user-facing app. It is the memory, policy, benchmark, and QA source for the DubMN / Mongol Dub Genie product.

It contains:

- Natural Mongolian translation memory
- Forbidden literal/stiff translation phrases
- Suspicious ASR phrase flags
- 3-stage Mongolian dubbing translation pipeline
- Segment metadata plan
- Emotion/style/delivery marker plan
- TTS cache plan
- Safe voice policy
- Benchmark translation cases

## Canonical product direction

DubMN / Mongol Dub Genie turns video or audio into:

1. Mongolian subtitle `.srt`
2. Natural Mongolian translation `.txt`
3. Rough AI dub preview
4. Full dubbing quote/manual production workflow

## Relationship to `mongol-dub-genie`

The canonical app repo now contains migrated memory and tests from this repo:

- `src/lib/dubbing-memory.ts`
- `src/lib/dubbing-memory.test.ts`
- `scripts/worker-translation-pipeline.mjs`
- `scripts/memory-pipeline-demo.mjs`

This repo remains useful as the upstream memory/QA workspace. New translation fixes and benchmark cases should be added here first, validated, then exported/mirrored to the app repo.

## Commands

Validate memory:

```bash
npm run validate:memory
```

Validate integration manifest:

```bash
npm run validate:integration
```

Export memory package for the app repo:

```bash
npm run export:memory
```

Run all local checks:

```bash
npm run validate:all
```

## Workflow

1. Add or update translation memory in `dubbing_memory.json`.
2. Add benchmark cases in `test/fixtures/translation_benchmark_cases.json`.
3. Run `npm run validate:all`.
4. Export memory with `npm run export:memory`.
5. Mirror approved changes into `mongol-dub-genie`.
6. Run app repo tests/build.

## Voice and copyright policy

Allowed: similar voice assignment by age, gender, timbre, energy, and emotion.

Forbidden: cloning or impersonating a real person without explicit permission.

Copyright gate: user-facing app must keep a copyright/permission confirmation before processing submitted media.
