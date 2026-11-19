@echo off
rem 윈도우용 시나리오 테스트. 서버 3개를 새로 띄운 상태에서 실행한다.
rem 사용법: tests\e2e\run.cmd            (전부)
rem         tests\e2e\run.cmd auth       (하나만)
chcp 65001 >nul
setlocal enabledelayedexpansion
cd /d "%~dp0"
set list=%*
if "%list%"=="" set list=quota-resale resale-selection risk idempotency auth
set fail=0
for %%t in (%list%) do (
  echo == %%t
  node %%t.mjs
  if errorlevel 1 set fail=1
)
exit /b !fail!
