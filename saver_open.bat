@echo off

start "Python Server" cmd /k "cd /d C:\Users\y_oota\Documents\Graduation_work\secretary_app && python -m http.server 8000"

timeout /t 3 /nobreak > nul
start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" http://localhost:8000/html

code "C:\Users\y_oota\Documents\Graduation_work"
exit