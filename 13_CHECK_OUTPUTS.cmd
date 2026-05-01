@echo off
cd /d C:\zaykama_recovery_bundle

echo CHECK OUTPUT FILES
echo.

dir outputs
echo.

echo CHECK IMPORTANT FILES
echo.

if exist outputs\dubbed_audio_master.wav echo OK audio master exists
if not exist outputs\dubbed_audio_master.wav echo MISSING dubbed_audio_master.wav

if exist sample_real_30s.mp4 echo OK input video exists
if not exist sample_real_30s.mp4 echo MISSING sample_real_30s.mp4

if exist outputs\final_dubbed.mp4 echo OK final video exists
if not exist outputs\final_dubbed.mp4 echo MISSING final_dubbed.mp4

pause