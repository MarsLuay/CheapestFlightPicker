@echo off
setlocal EnableDelayedExpansion
set "RELAUNCHED_AFTER_TOOLCHAIN=0"
if /i "%~1"=="--after-toolchain-install" set "RELAUNCHED_AFTER_TOOLCHAIN=1"
set "LAUNCHER_DIR=%~dp0"
if "%LAUNCHER_DIR:~-1%"=="\" set "LAUNCHER_DIR=%LAUNCHER_DIR:~0,-1%"
set "REPO_URL=https://github.com/MarsLuay/CheapestFlightPicker.git"
set "REPO_DIR=%LAUNCHER_DIR%"
set "STANDALONE_REPO_DIR=%LAUNCHER_DIR%\CheapestFlightPicker"

call :ensure_toolchain
if errorlevel 2 exit /b 0
if errorlevel 1 exit /b 1

if exist "!REPO_DIR!\.git" (
  if not exist "!REPO_DIR!\workspace\app\package.json" (
    echo The repo metadata was found at "!REPO_DIR!", but workspace\app is missing.
    echo Re-clone the Cheapest Flight Picker repo so the tracked app files are restored.
    call :fail 1
    exit /b 1
  )
) else (
  set "REPO_DIR=!STANDALONE_REPO_DIR!"
  if not exist "!REPO_DIR!\.git" (
    if exist "!REPO_DIR!" (
      dir /b "!REPO_DIR!" 2>nul | findstr . >nul
      if not errorlevel 1 (
        echo "!REPO_DIR!" already exists but is not a git clone.
        echo Move or delete that folder, then run this launcher again.
        call :fail 1
        exit /b 1
      )
    )

    echo No local repo was found next to this launcher.
    echo Cloning Cheapest Flight Picker into "!REPO_DIR!"...
    git clone "%REPO_URL%" "!REPO_DIR!"
    if errorlevel 1 (
      call :fail 1
      exit /b 1
    )
  )
)

echo Checking for repo updates...
git -C "!REPO_DIR!" status --porcelain --untracked-files=normal | findstr . >nul
if errorlevel 1 (
  git -C "!REPO_DIR!" pull --ff-only origin main
  if errorlevel 1 (
    echo Failed to update the repo automatically.
    call :fail 1
    exit /b 1
  )
) else (
  echo Local changes detected. Skipping auto-update so your work stays untouched.
)

set "WORKSPACE_DIR=!REPO_DIR!\workspace"
set "APP_DIR=!WORKSPACE_DIR!\app"

if not exist "!APP_DIR!\package.json" (
  echo workspace\app is missing or incomplete.
  echo Re-clone the Cheapest Flight Picker repo so the tracked app files are restored.
  call :fail 1
  exit /b 1
)

cd /d "!APP_DIR!"

where npm >nul 2>nul
if errorlevel 1 (
  echo npm is required but was not found on PATH.
  call :fail 1
  exit /b 1
)

echo Installing dependencies...
call npm install
if errorlevel 1 (
  call :fail 1
  exit /b 1
)

echo Running typecheck and tests...
call npm run check
if errorlevel 1 (
  call :fail 1
  exit /b 1
)
call npm run test
if errorlevel 1 (
  call :fail 1
  exit /b 1
)

echo Building server and web app...
call npm run build
if errorlevel 1 (
  call :fail 1
  exit /b 1
)

echo Checking for an existing app instance...
powershell -NoProfile -Command "try { $response = Invoke-WebRequest -UseBasicParsing http://localhost:8787/api/health; if ($response.StatusCode -eq 200) { exit 0 } } catch {}; exit 1"
if errorlevel 1 (
  echo Launching app...
  set "APP_LAUNCH_DIR=%CD%"
  powershell -NoProfile -Command "Start-Process -FilePath 'cmd.exe' -WorkingDirectory $env:APP_LAUNCH_DIR -ArgumentList '/k','npm start' | Out-Null"
  if errorlevel 1 (
    call :fail 1
    exit /b 1
  )

  powershell -NoProfile -Command "$ProgressPreference='SilentlyContinue'; $deadline=(Get-Date).AddSeconds(30); do { try { $response = Invoke-WebRequest -UseBasicParsing http://localhost:8787/api/health; if ($response.StatusCode -eq 200) { exit 0 } } catch {}; Start-Sleep -Milliseconds 500 } while ((Get-Date) -lt $deadline); exit 1"
  if errorlevel 1 (
    echo The server did not become ready within 30 seconds. Check the server window for errors.
    call :fail 1
    exit /b 1
  )
) else (
  echo App is already running. Reusing the existing instance.
)

start "" http://localhost:8787
echo App launched in your browser. Close the server window to stop it.
exit /b 0

:ensure_toolchain
call :refresh_path
call :add_known_tool_paths

set "MISSING_GIT=0"
set "MISSING_NODE=0"
where git >nul 2>nul
if errorlevel 1 set "MISSING_GIT=1"
where node >nul 2>nul
if errorlevel 1 set "MISSING_NODE=1"
where npm >nul 2>nul
if errorlevel 1 set "MISSING_NODE=1"

if "!MISSING_GIT!"=="0" if "!MISSING_NODE!"=="0" exit /b 0

echo Missing setup tools were detected.
where winget >nul 2>nul
if errorlevel 1 (
  echo winget is not available on this machine, so Git and Node.js could not be installed automatically.
  echo Install Git and Node.js LTS, then run this launcher again.
  call :fail 1
  exit /b 1
)

set "TOOLCHAIN_INSTALLED=0"

if "!MISSING_GIT!"=="1" (
  echo Git was not found. Installing Git with winget...
  winget install --id "Git.Git" --exact --accept-package-agreements --accept-source-agreements --silent
  if errorlevel 1 (
    echo Failed to install Git automatically.
    echo Install Git, then run this launcher again.
    call :fail 1
    exit /b 1
  )
  set "TOOLCHAIN_INSTALLED=1"
)

if "!MISSING_NODE!"=="1" (
  echo Node.js or npm was not found. Installing Node.js LTS with winget...
  winget install --id "OpenJS.NodeJS.LTS" --exact --accept-package-agreements --accept-source-agreements --silent
  if errorlevel 1 (
    echo Failed to install Node.js LTS automatically.
    echo Install Node.js LTS, then run this launcher again.
    call :fail 1
    exit /b 1
  )
  set "TOOLCHAIN_INSTALLED=1"
)

call :refresh_path
call :add_known_tool_paths

set "MISSING_AFTER_INSTALL=0"
where git >nul 2>nul
if errorlevel 1 set "MISSING_AFTER_INSTALL=1"
where node >nul 2>nul
if errorlevel 1 set "MISSING_AFTER_INSTALL=1"
where npm >nul 2>nul
if errorlevel 1 set "MISSING_AFTER_INSTALL=1"

if "!MISSING_AFTER_INSTALL!"=="0" exit /b 0

if "!TOOLCHAIN_INSTALLED!"=="1" if "!RELAUNCHED_AFTER_TOOLCHAIN!"=="0" (
  echo.
  echo The missing setup tools were installed, but this terminal cannot see them yet.
  echo Opening a fresh launcher window so setup can continue with the updated PATH...
  start "" cmd.exe /k ""%~f0" --after-toolchain-install"
  exit /b 2
)

echo Git, Node.js, or npm is still not available on PATH.
echo Close this window, open a new Command Prompt, and run setup-and-launch.bat again.
call :fail 1
exit /b 1

:add_known_tool_paths
for %%P in (
  "%ProgramFiles%\Git\cmd"
  "%ProgramFiles%\Git\bin"
  "%ProgramFiles%\nodejs"
  "%LocalAppData%\Programs\Git\cmd"
  "%LocalAppData%\Programs\Git\bin"
  "%LocalAppData%\Programs\nodejs"
) do (
  if exist "%%~P" (
    set "PATH=%%~P;!PATH!"
  )
)

exit /b 0

:fail
set "FAIL_CODE=%~1"
if not defined FAIL_CODE set "FAIL_CODE=1"
echo.
echo Setup stopped before the app could launch.
echo Press any key to close this window.
pause >nul
exit /b %FAIL_CODE%

:refresh_path
set "MACHINE_PATH="
set "USER_PATH="
for /f "usebackq tokens=2,*" %%A in (`reg query "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment" /v Path 2^>nul ^| find /i "Path"`) do set "MACHINE_PATH=%%B"
for /f "usebackq tokens=2,*" %%A in (`reg query "HKCU\Environment" /v Path 2^>nul ^| find /i "Path"`) do set "USER_PATH=%%B"

if defined MACHINE_PATH (
  set "PATH=!MACHINE_PATH!"
)

if defined USER_PATH (
  if defined PATH (
    set "PATH=!PATH!;!USER_PATH!"
  ) else (
    set "PATH=!USER_PATH!"
  )
)

exit /b 0
