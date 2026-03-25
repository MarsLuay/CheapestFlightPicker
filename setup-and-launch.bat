@echo off
setlocal EnableDelayedExpansion
set "LAUNCHER_DIR=%~dp0"
if "%LAUNCHER_DIR:~-1%"=="\" set "LAUNCHER_DIR=%LAUNCHER_DIR:~0,-1%"
set "REPO_URL=https://github.com/MarsLuay/CheapestFlightPicker.git"
set "REPO_DIR=%LAUNCHER_DIR%"
set "STANDALONE_REPO_DIR=%LAUNCHER_DIR%\CheapestFlightPicker"

call :ensure_command git "Git.Git" "Git"
if errorlevel 1 exit /b 1

call :ensure_command node "OpenJS.NodeJS.LTS" "Node.js LTS"
if errorlevel 1 exit /b 1

call :ensure_command npm "OpenJS.NodeJS.LTS" "Node.js LTS"
if errorlevel 1 exit /b 1

if exist "!REPO_DIR!\.git" (
  if not exist "!REPO_DIR!\workspace\app\package.json" (
    echo The repo metadata was found at "!REPO_DIR!", but workspace\app is missing.
    echo Re-clone the Cheapest Flight Picker repo so the tracked app files are restored.
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
        exit /b 1
      )
    )

    echo No local repo was found next to this launcher.
    echo Cloning Cheapest Flight Picker into "!REPO_DIR!"...
    git clone "%REPO_URL%" "!REPO_DIR!"
    if errorlevel 1 exit /b 1
  )
)

echo Checking for repo updates...
git -C "!REPO_DIR!" status --porcelain --untracked-files=normal | findstr . >nul
if errorlevel 1 (
  git -C "!REPO_DIR!" pull --ff-only origin main
  if errorlevel 1 (
    echo Failed to update the repo automatically.
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
  exit /b 1
)

cd /d "!APP_DIR!"

where npm >nul 2>nul
if errorlevel 1 (
  echo npm is required but was not found on PATH.
  exit /b 1
)

echo Installing dependencies...
call npm install
if errorlevel 1 exit /b 1

echo Running typecheck and tests...
call npm run check
if errorlevel 1 exit /b 1
call npm run test
if errorlevel 1 exit /b 1

echo Building server and web app...
call npm run build
if errorlevel 1 exit /b 1

echo Checking for an existing app instance...
powershell -NoProfile -Command "try { $response = Invoke-WebRequest -UseBasicParsing http://localhost:8787/api/health; if ($response.StatusCode -eq 200) { exit 0 } } catch {}; exit 1"
if errorlevel 1 (
  echo Launching app...
  set "APP_LAUNCH_DIR=%CD%"
  powershell -NoProfile -Command "Start-Process -FilePath 'cmd.exe' -WorkingDirectory $env:APP_LAUNCH_DIR -ArgumentList '/k','npm start' | Out-Null"
  if errorlevel 1 exit /b 1

  powershell -NoProfile -Command "$ProgressPreference='SilentlyContinue'; $deadline=(Get-Date).AddSeconds(30); do { try { $response = Invoke-WebRequest -UseBasicParsing http://localhost:8787/api/health; if ($response.StatusCode -eq 200) { exit 0 } } catch {}; Start-Sleep -Milliseconds 500 } while ((Get-Date) -lt $deadline); exit 1"
  if errorlevel 1 (
    echo The server did not become ready within 30 seconds. Check the server window for errors.
    exit /b 1
  )
) else (
  echo App is already running. Reusing the existing instance.
)

start "" http://localhost:8787
echo App launched in your browser. Close the server window to stop it.
exit /b 0

:ensure_command
set "COMMAND_NAME=%~1"
set "WINGET_ID=%~2"
set "DISPLAY_NAME=%~3"

where "%COMMAND_NAME%" >nul 2>nul
if not errorlevel 1 exit /b 0

echo %DISPLAY_NAME% was not found. Trying to install it with winget...
where winget >nul 2>nul
if errorlevel 1 (
  echo winget is not available on this machine, so %DISPLAY_NAME% could not be installed automatically.
  echo Install %DISPLAY_NAME%, then run this launcher again.
  exit /b 1
)

winget install --id "%WINGET_ID%" --exact --accept-package-agreements --accept-source-agreements --silent
if errorlevel 1 (
  echo Failed to install %DISPLAY_NAME% automatically.
  echo Install %DISPLAY_NAME%, then run this launcher again.
  exit /b 1
)

call :refresh_path
where "%COMMAND_NAME%" >nul 2>nul
if not errorlevel 1 exit /b 0

for %%P in (
  "%ProgramFiles%\Git\cmd"
  "%ProgramFiles%\Git\bin"
  "%ProgramFiles%\nodejs"
  "%LocalAppData%\Programs\Git\cmd"
  "%LocalAppData%\Programs\Git\bin"
  "%LocalAppData%\Programs\nodejs"
) do (
  if exist %%~P (
    set "PATH=%%~P;!PATH!"
  )
)

where "%COMMAND_NAME%" >nul 2>nul
if not errorlevel 1 exit /b 0

echo %DISPLAY_NAME% installed, but this shell still cannot find %COMMAND_NAME%.
echo Close and rerun the launcher if the install just finished.
exit /b 1

:refresh_path
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
