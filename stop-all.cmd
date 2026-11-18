@echo off
rem 윈도우용: run-all.cmd 로 띄운 서버 3개와 웹(포트 8080·8081·8082·5173)을 끈다.
chcp 65001 >nul
powershell -NoProfile -Command "$ports = 8080,8081,8082,5173; Get-NetTCPConnection -LocalPort $ports -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }"
echo 서버와 웹을 껐습니다.
