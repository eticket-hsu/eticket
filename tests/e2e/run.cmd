@echo off
rem 테스트마다 서버를 새로 띄우고 초기 데이터에서 실행한다.
chcp 65001 >nul
node "%~dp0runner.mjs" %*
exit /b %errorlevel%
