@echo off
if exist "%ProgramFiles%\LocalIP\LocalIP.exe" (
    start "" "%ProgramFiles%\LocalIP\LocalIP.exe"
) else (
    start "" "%~dp0dist\LocalIP-Setup.exe"
)
