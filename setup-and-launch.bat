@echo off
setlocal
set "ROOT_DIR=%~dp0"
if "%ROOT_DIR:~-1%"=="\" set "ROOT_DIR=%ROOT_DIR:~0,-1%"
set "WORKSPACE_DIR=%ROOT_DIR%\workspace"
set "APP_DIR=%WORKSPACE_DIR%\app"

where git >nul 2>nul
if errorlevel 1 (
  echo git is required but was not found on PATH.
  exit /b 1
)

if not exist "%ROOT_DIR%\.git" (
  echo The repo metadata was not found at "%ROOT_DIR%".
  echo Re-clone the Cheapest Flight Picker repo before running this launcher.
  exit /b 1
)

echo Checking for repo updates...
git -C "%ROOT_DIR%" status --porcelain --untracked-files=normal | findstr . >nul
if errorlevel 1 (
  git -C "%ROOT_DIR%" pull --ff-only origin main
  if errorlevel 1 (
    echo Failed to update the repo automatically.
    exit /b 1
  )
) else (
  echo Local changes detected. Skipping auto-update so your work stays untouched.
)

if not exist "%APP_DIR%\package.json" (
  echo workspace\app is missing or incomplete.
  echo Re-clone the Cheapest Flight Picker repo so the tracked app files are restored.
  exit /b 1
)

cd /d "%APP_DIR%"

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
