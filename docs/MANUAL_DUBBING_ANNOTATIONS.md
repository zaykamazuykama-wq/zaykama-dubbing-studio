# Manual dubbing annotations

`manual_dubbing_annotations.json` lets reviewers manually attach character, voice, emotion, style, delivery, and edited TTS text metadata to generated dubbing segments.

This is for safe similar-voice assignment only. It does not clone voices, imitate real people, train voice models, add RVC, add GPT-SoVITS, or add UVR5/audio-separator.

## Runtime file location

Place the runtime file at the repository root:

```text
manual_dubbing_annotations.json
```

The runtime file is intentionally ignored by git so project-specific review notes do not get committed.

The example file is only a template:

```text
examples/manual_dubbing_annotations.example.json
```

Copy it when starting a local review pass:

```bash
cp examples/manual_dubbing_annotations.example.json manual_dubbing_annotations.json
```

Then edit the copied root-level `manual_dubbing_annotations.json` for your own project.

## Minimal example

```json
[
  {
    "start": 0.0,
    "end": 2.5,
    "characterId": "guide_01",
    "speakerName": "Guide",
    "voiceId": "F_NARRATOR_WARM",
    "emotion": "calm",
    "editedText": "Сайн байна уу. Аяллаа эхэлье."
  }
]
```

## Full example

```json
[
  {
    "start": 0.0,
    "end": 2.4,
    "characterId": "captain_01",
    "speakerName": "Captain",
    "voiceId": "M_ADULT_LEADER",
    "providerVoiceId": "mn-MN-BataaNeural",
    "emotion": "determined",
    "style": "commanding",
    "delivery": "clear steady pace",
    "editedText": "Баг аа, бэлтгэлээ шалгаад хөдөлцгөөе.",
    "notes": "Opening instruction; keep it confident, not shouted."
  },
  {
    "start": 2.4,
    "end": 5.0,
    "characterId": "narrator_01",
    "speakerName": "Narrator",
    "voiceId": "F_NARRATOR_WARM",
    "providerVoiceId": "mn-MN-YesuiNeural",
    "emotion": "warm",
    "style": "documentary",
    "delivery": "gentle measured pace",
    "editedText": "Өглөөний гэрэл хотын дээгүүр аажмаар туслаа.",
    "notes": "Narration line; preserve a calm documentary feel."
  },
  {
    "start": 5.0,
    "end": 7.2,
    "characterId": "runner_01",
    "speakerName": "Runner",
    "voiceId": "M_YOUNG_HERO",
    "emotion": "urgent",
    "style": "energetic",
    "delivery": "fast but understandable",
    "editedText": "Би одоо очлоо, хаалгаа нээгээрэй!",
    "notes": "Young action line; urgent but still clear for dubbing."
  }
]
```

Do not paste copyrighted dialogue from real films into reusable examples. Keep examples generic and original.

## Schema

The root JSON value must be an array. Each item should be an object with numeric `start` and `end` times in seconds. Invalid items are ignored.

| Field | Required | Type | Behavior |
| --- | --- | --- | --- |
| `start` | Yes | number | Annotation start time in seconds. `0` is valid. |
| `end` | Yes | number | Annotation end time in seconds. Must be greater than `start`. |
| `characterId` | No | string | Stable internal character key copied to the matched segment. |
| `speakerName` | No | string | Human-readable speaker label copied to the matched segment. |
| `voiceId` | No | string | Manual preset ID from the allowed voice library, for example `M_ADULT_LEADER`. Invalid values fall back safely. |
| `providerVoiceId` | No | string | Provider voice name from the allowed library, currently `mn-MN-BataaNeural` or `mn-MN-YesuiNeural`. Invalid values fall back safely. |
| `emotion` | No | string | Emotion label copied to segment metadata and included in the TTS cache payload/key. |
| `style` | No | string | Style label copied to segment metadata and included in the TTS cache payload/key. |
| `delivery` | No | string | Delivery guidance copied to segment metadata and included in the TTS cache payload/key. |
| `editedText` | No | string | Overrides `mongolianText` for TTS generation while preserving the original `mongolianText` on the segment. |
| `notes` | No | string | Reviewer notes. Copied to segment metadata as manual notes; not used for TTS text. |

`startTime`/`endTime` aliases are also accepted by the runtime, but new files should prefer `start`/`end`.

## Time overlap matching

Annotations are matched to generated segments by timeline overlap:

1. The loader keeps annotation objects with valid numeric `start` and `end` times.
2. For each segment, the runtime computes overlap between the segment time range and each annotation time range.
3. Only annotations with positive overlap can match.
4. The best match is the highest overlap ratio relative to the segment duration.
5. If overlap scores tie, the annotation whose start time is closest to the segment start wins.

Zero start timestamps are valid. For example, an annotation starting at `0.0` can match the first segment.

## Edited text behavior

When `editedText` is present and non-empty, TTS uses `editedText` instead of the segment's `mongolianText`.

The original `mongolianText` is preserved on the segment. This lets reviewers keep the translated subtitle text while trying a more natural or shorter spoken line for dubbing.

## Manual voice behavior

Manual voices are constrained to the allowed voice library.

Use `voiceId` for the Zaykama preset ID. Current examples include:

- `M_ADULT_LEADER`
- `F_NARRATOR_WARM`
- `M_YOUNG_HERO`
- `F_ADULT_STRONG`

Use `providerVoiceId` only for allowed provider voice names. Current Mongolian Edge-TTS names are:

- `mn-MN-BataaNeural`
- `mn-MN-YesuiNeural`

If `voiceId` or `providerVoiceId` is invalid, the runtime falls back to automatic safe voice selection from the allowed library. The file cannot request arbitrary provider voices.

This is similar voice assignment only. Choose a preset by age, gender, timbre, energy, archetype, and emotion fit. Do not use this feature to clone, impersonate, or imitate real people.

## 26-preset voice bank usage

The allowed voice bank contains 26 safe presets: 13 male and 13 female. Presets cover narrator, young, adult, elder, leader, villain, comic, warm, dramatic, calm, and energetic archetypes.

Multiple presets may currently map to the same Mongolian Edge-TTS provider voice because the provider has a small Mongolian voice set. The preset IDs are still useful for manual assignment, review workflow, and future provider-swappable expansion.

Choose IDs from the allowed voice library in `zaykama_v9_5_tts_hook.py`. Do not invent new IDs in annotation files unless the code has been updated to allow them.

## Emotion, style, delivery, and TTS cache behavior

`emotion`, `style`, and `delivery` are preserved on matched segment metadata.

They are also included in the TTS cache payload/key. Changing any of these fields can generate a different cache key and therefore a new cached TTS result, even when the spoken text is unchanged.

`notes` is for reviewer context and is not part of the TTS text selection.

## Safety rules and non-goals

Allowed:

- Assign a segment to a safe similar voice preset.
- Add character labels for review clarity.
- Mark emotion, style, and delivery metadata.
- Override the spoken TTS text with `editedText` while preserving original translated text.

Not allowed / not implemented:

- Voice cloning.
- Real-person imitation or impersonation.
- RVC.
- GPT-SoVITS.
- UVR5 or audio-separator workflows.
- Adding arbitrary provider voice names outside the allowed voice library.
- Changing subtitle timing or translation memory behavior through annotations.

## How to test locally

From the repository root:

```bash
cp examples/manual_dubbing_annotations.example.json manual_dubbing_annotations.json
python3 -m py_compile zaykama_v9_5_tts_hook.py
python3 zaykama_v9_5_tts_hook.py --self-test
npm test
```

For a real local dubbing run, provide your normal input options. The runtime automatically looks for `manual_dubbing_annotations.json` in the repository root and applies it after translation, before TTS generation.

After testing, keep or edit your local root-level file as needed. It should not be committed.

## Troubleshooting

### My annotation did not apply

- Confirm the file is named exactly `manual_dubbing_annotations.json`.
- Confirm it is in the repository root, not under `examples/`.
- Confirm the JSON root is an array.
- Confirm each annotation has numeric `start` and `end` values.
- Confirm `end` is greater than `start`.
- Confirm the annotation time range overlaps the target segment time range.

### The first segment at time zero did not match

Use numeric `0` or `0.0` for `start`. Zero timestamps are valid.

### My voice choice was ignored

- Confirm `voiceId` exactly matches an allowed preset ID.
- Confirm `providerVoiceId` exactly matches an allowed provider voice name.
- If either value is invalid, the runtime falls back safely to automatic voice selection.

### TTS regenerated even though the text was the same

`emotion`, `style`, and `delivery` are included in the TTS cache payload/key. Changing them can create a new cache key and a new cached TTS result.

### The output subtitle text changed unexpectedly

`editedText` is intended for TTS text selection. The original `mongolianText` is preserved on the segment. If you need to change exported subtitles, use the appropriate subtitle or segment review workflow rather than relying on annotation notes.
