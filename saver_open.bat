@echo off

cd "C:\Users\ZH_youzhi\Downloads\secretary_app\secretary_app.venv\Scripts"
call activate.bat
cd "C:\Users\ZH_youzhi\Downloads\secretary_app\secretary_app"
start /b python app.py

start code "C:\Users\ZH_youzhi\Downloads\secretary_app"

start chrome https://127.0.0.1:5000
