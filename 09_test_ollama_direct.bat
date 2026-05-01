@echo off
chcp 65001 >nul
cd /d C:\zaykama_recovery_bundle

echo ==========================================
echo DIRECT OLLAMA TRANSLATION TEST
echo ==========================================

start "" /min ollama serve
timeout /t 3 /nobreak >nul

powershell -NoProfile -ExecutionPolicy Bypass -Command "$body = @{model='qwen2.5:3b'; stream=$false; prompt='Translate this to natural Mongolian only: Hello, welcome back to the show.'} | ConvertTo-Json -Compress; $r = Invoke-RestMethod -Uri 'http://localhost:11434/api/generate' -Method Post -Body $body -ContentType 'application/json'; Write-Host ''; Write-Host 'RESULT:'; Write-Host $r.response"

echo.
echo ==========================================
echo Хэрвээ RESULT дээр Монгол орчуулга гарвал Ollama OK.
echo Тэгвэл дараагийн алхам нь Zaykama file patch.
echo ==========================================
pause