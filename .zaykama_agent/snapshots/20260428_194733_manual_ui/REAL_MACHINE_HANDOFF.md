# Real Machine Handoff

Copy `zaykama_recovery_bundle.zip` to an internet-enabled computer and run:

```bash
unzip -o zaykama_recovery_bundle.zip
cd zaykama_recovery_bundle
bash run_provider_smoke.sh
```

## Outcomes

- If Edge-TTS works: `PROVIDER_SMOKE_PASS`
- If Edge-TTS fails: `PROVIDER_SMOKE_FAIL`

Only `PROVIDER_SMOKE_PASS` means real Mongolian TTS provider is working.

This still does not mean full-auto dubbing is production-green unless real ASR, real translation, real provider TTS, real audio master assembly, and final video gate also pass.
