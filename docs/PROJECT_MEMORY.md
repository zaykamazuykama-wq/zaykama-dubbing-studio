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
- Use similar voice assignment, not unauthorized voice cloning.
- GitHub repo is the source of truth.

## Agent roles

- ChatGPT handles architecture, prompt, and review.
- OpenClaw, Copilot, and Hermes write small patches.
- Claude handles schema and long-context analysis.

## Workflow rules

- One task = one branch/PR.
- Do not replace `zaykama_v9_5_tts_hook.py`; minimal patch only.
- Two-pass translation pipeline is planned.
