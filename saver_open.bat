@echo off

cd "C:\Users\y_oota\Documents\Graduation_work\secretary_app.venv\Scripts"
call activate.bat
cd "C:\Users\y_oota\Documents\Graduation_work\secretary_app"
start /b python app.py

start code "C:\Users\y_oota\Documents\Graduation_work"

start chrome http://172.19.0.195:5000/
