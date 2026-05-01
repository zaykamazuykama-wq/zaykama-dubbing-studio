# Zaykama Provider Environment Setup

This bundle is for testing whether the real Edge-TTS Mongolian provider works on an internet-enabled machine.

## Requirements

- Python 3.10+
- ffmpeg available in PATH
- Internet access for `pip install edge-tts`
- `zaykama_v9_5_tts_hook.py` from this bundle

## Run

```bash
bash run_provider_smoke.sh
```

## Expected result

- `PROVIDER_SMOKE_PASS` means at least one verified Mongolian Edge-TTS voice generated real provider TTS.
- `PROVIDER_SMOKE_FAIL` means the provider dependency, network, voice availability, or runtime conversion failed.
- Provider smoke pass does not mean full-auto dubbing is production-green. ASR, translation, audio master, and final video gates must also pass with real components.
