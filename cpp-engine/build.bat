@echo off
setlocal
where g++ >nul 2>nul
if errorlevel 1 (
  echo g++ was not found.
  echo Install MinGW-w64 or MSYS2 with g++ and add it to PATH.
  exit /b 1
)
g++ -std=c++17 -O2 main.cpp -o traffic_engine.exe
if errorlevel 1 exit /b 1
echo Built traffic_engine.exe successfully.
