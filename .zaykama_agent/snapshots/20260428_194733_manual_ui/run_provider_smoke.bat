python -m pip install --upgrade edge-tts
python -m py_compile zaykama_v9_5_tts_hook.py
python zaykama_v9_5_tts_hook.py --self-test --headless
python zaykama_v9_5_tts_hook.py --provider-smoke --headless
pause