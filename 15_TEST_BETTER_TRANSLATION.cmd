@echo off
cd /d C:\zaykama_recovery_bundle

echo Testing better Ollama translation model...
echo This will pull qwen2.5:7b first time.
echo.

start "" /min ollama serve
timeout /t 5 /nobreak >nul

ollama pull qwen2.5:7b

echo.
echo TEST 1:
ollama run qwen2.5:7b "You are a professional Mongolian dubbing translator. Translate naturally into everyday spoken Mongolian from Mongolia. Do not translate word by word. Keep emotion and meaning. Return only Mongolian: Hello everyone, welcome back to the show."

echo.
echo TEST 2:
ollama run qwen2.5:7b "You are a professional Mongolian dubbing translator. Translate naturally into everyday spoken Mongolian from Mongolia. Do not explain. Return only Mongolian: I don't know what happened, but this is really exciting."

echo.
echo TEST 3:
ollama run qwen2.5:7b "You are a professional Mongolian dubbing translator. Translate naturally into everyday spoken Mongolian from Mongolia. Casual dialogue, not formal, not robotic. Return only Mongolian: Guess who just got some cake."

echo.
pause