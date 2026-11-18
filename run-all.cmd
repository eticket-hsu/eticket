@echo off
rem 윈도우용: 서버 3개 + 웹을 각각 새 창으로 띄운다.
rem   FairTicket 8080 / 별티켓 8081 / 달티켓 8082 / 웹 5173
rem 끄려면 stop-all.cmd 를 실행하거나 열린 창 4개를 닫는다.
chcp 65001 >nul
setlocal
cd /d "%~dp0"

where java >nul 2>nul || (echo [오류] Java 21 이상을 설치해 주세요. & goto :fail)
where npm >nul 2>nul || (echo [오류] Node.js 20 이상을 설치해 주세요. & goto :fail)

echo == 서버 빌드 (처음에는 몇 분 걸릴 수 있음) ==
pushd fairticket-server
call gradlew.bat bootJar -q
if errorlevel 1 (popd & echo [오류] FairTicket 서버 빌드 실패 & goto :fail)
popd
pushd vendor-server
call gradlew.bat bootJar -q
if errorlevel 1 (popd & echo [오류] 예매처 서버 빌드 실패 & goto :fail)
popd

if not exist web\node_modules (
  echo == 화면 패키지 설치 ==
  pushd web
  call npm install
  if errorlevel 1 (popd & echo [오류] npm install 실패 & goto :fail)
  popd
)

echo == 실행 ==
start "FairTicket 8080" java -jar fairticket-server\build\libs\fairticket-server-0.0.1-SNAPSHOT.jar
start "Star 8081" java -jar vendor-server\build\libs\vendor-server-0.0.1-SNAPSHOT.jar --spring.profiles.active=star
start "Moon 8082" java -jar vendor-server\build\libs\vendor-server-0.0.1-SNAPSHOT.jar --spring.profiles.active=moon
start "Web 5173" cmd /k "cd /d "%~dp0web" && npm run dev"

echo.
echo 창 4개가 열렸습니다. 30초~1분 뒤 브라우저에서 http://localhost:5173 을 여세요.
echo 끄려면 stop-all.cmd 를 실행하세요.
exit /b 0

:fail
echo.
pause
exit /b 1
