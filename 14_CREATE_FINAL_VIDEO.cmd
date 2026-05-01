@echo off
cd /d C:\zaykama_recovery_bundle

echo Creating final dubbed video...
echo.

ffmpeg -y -i sample_real_30s.mp4 -i outputs\dubbed_audio_master.wav -map 0:v:0 -map 1:a:0 -c:v copy -c:a aac -shortest outputs\final_dubbed.mp4

echo.
echo CHECK FINAL VIDEO
echo.

if exist outputs\final_dubbed.mp4 (
    echo OK final_dubbed.mp4 created
    dir outputs\final_dubbed.mp4
) else (
    echo FAILED final_dubbed.mp4 not created
)

echo.
pause