@echo off
chcp 65001 >nul
cd /d %~dp0
python naver_autopost.py >> autopost.log 2>&1
