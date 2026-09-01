@echo off
setlocal EnableDelayedExpansion
if defined TEMP (
  set "LAUNCHER_LOG_FILE=%TEMP%\CheapestFlightPicker-setup.log"
) else (
  set "LAUNCHER_LOG_FILE=%~dp0CheapestFlightPicker-setup.log"
)
set "CURRENT_STEP=launcher startup"
call :log "INFO Launcher started."
call :log "INFO Launcher path: %~f0"
echo Launcher log: "!LAUNCHER_LOG_FILE!"
set "CURRENT_STEP=initializing Windows PATH"
call :bootstrap_windows_path
set "CURRENT_STEP=locating PowerShell"
call :resolve_powershell
set "RELAUNCHED_AFTER_TOOLCHAIN=0"
if /i "%~1"=="--after-toolchain-install" set "RELAUNCHED_AFTER_TOOLCHAIN=1"
set "LAUNCHER_DIR=%~dp0"
if "%LAUNCHER_DIR:~-1%"=="\" set "LAUNCHER_DIR=%LAUNCHER_DIR:~0,-1%"
set "REPO_URL=https://github.com/MarsLuay/CheapestFlightPicker.git"
set "REPO_DIR=%LAUNCHER_DIR%"
set "STANDALONE_REPO_DIR=%LAUNCHER_DIR%\CheapestFlightPicker"
set "APP_PORT=8787"
set "APP_URL=http://localhost:8787"

set "CURRENT_STEP=ensuring Git and Node.js"
call :ensure_toolchain
if errorlevel 2 (
  call :log "INFO Toolchain installation requested a fresh launcher window."
  echo Detailed launcher log: "!LAUNCHER_LOG_FILE!"
  exit /b 0
)
if errorlevel 1 exit /b 1

if exist "!LAUNCHER_DIR!\workspace\app\package.json" (
  set "REPO_DIR=!LAUNCHER_DIR!"
  goto :after_repo_setup
)

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
    set "CURRENT_STEP=cloning the repository"
    call :log "INFO Cloning repository."
    git clone "%REPO_URL%" "!REPO_DIR!" >>"!LAUNCHER_LOG_FILE!" 2>&1
    if errorlevel 1 (
      call :fail 1
      exit /b 1
    )
  )
)

echo Checking for repo updates...
set "CURRENT_STEP=checking repository updates"
if not exist "!REPO_DIR!\.git" (
  echo Using local workspace without git metadata.
  goto :after_repo_setup
)
git -C "!REPO_DIR!" status --porcelain --untracked-files=normal 2>>"!LAUNCHER_LOG_FILE!" | findstr . >nul
if errorlevel 1 (
  set "CURRENT_STEP=updating the repository"
  call :log "INFO Pulling repository updates."
  git -C "!REPO_DIR!" pull --ff-only origin main >>"!LAUNCHER_LOG_FILE!" 2>&1
  if errorlevel 1 (
    echo Failed to update the repo automatically.
    call :fail 1
    exit /b 1
  )
) else (
  echo Local changes detected. Skipping auto-update so your work stays untouched.
)

:after_repo_setup
set "WORKSPACE_DIR=!REPO_DIR!\workspace"
set "APP_DIR=!WORKSPACE_DIR!\app"

if not exist "!APP_DIR!\package.json" (
  echo workspace\app is missing or incomplete.
  echo Re-clone the Cheapest Flight Picker repo so the tracked app files are restored.
  call :fail 1
  exit /b 1
)

set "CURRENT_STEP=changing to the app directory"
cd /d "!APP_DIR!"
if errorlevel 1 (
  call :fail 1
  exit /b 1
)

set "CURRENT_STEP=checking for npm"
where npm >nul 2>nul
if errorlevel 1 (
  echo npm is required but was not found on PATH.
  call :fail 1
  exit /b 1
)

echo Installing dependencies...
set "CURRENT_STEP=installing npm dependencies"
call :log "INFO Running npm install."
call npm install >>"!LAUNCHER_LOG_FILE!" 2>&1
if errorlevel 1 (
  call :fail 1
  exit /b 1
)

echo Running typecheck and tests...
set "CURRENT_STEP=running typecheck"
call :log "INFO Running npm run check."
call npm run check >>"!LAUNCHER_LOG_FILE!" 2>&1
if errorlevel 1 (
  call :fail 1
  exit /b 1
)
set "CURRENT_STEP=running tests"
call :log "INFO Running npm run test."
call npm run test >>"!LAUNCHER_LOG_FILE!" 2>&1
if errorlevel 1 (
  call :fail 1
  exit /b 1
)

echo Building server and web app...
set "CURRENT_STEP=building the app"
call :log "INFO Running npm run build."
call npm run build >>"!LAUNCHER_LOG_FILE!" 2>&1
if errorlevel 1 (
  call :fail 1
  exit /b 1
)

echo Checking for an existing app instance...
set "CURRENT_STEP=checking app health"
call :log "INFO Checking app health."
call :check_app_health !APP_PORT! >>"!LAUNCHER_LOG_FILE!" 2>&1
if errorlevel 1 (
  call :select_app_port >>"!LAUNCHER_LOG_FILE!" 2>&1
  if errorlevel 1 (
    call :fail 1
    exit /b 1
  )
  echo Launching app...
  set "APP_LAUNCH_DIR=%CD%"
  set "APP_LAUNCH_PORT=!APP_PORT!"
  set "CURRENT_STEP=starting the app server"
  call :log "INFO Starting app server."
  call :run_powershell -NoProfile -Command "$env:PORT='!APP_LAUNCH_PORT!'; Start-Process -FilePath 'cmd.exe' -WorkingDirectory $env:APP_LAUNCH_DIR -ArgumentList '/k','npm start'" >>"!LAUNCHER_LOG_FILE!" 2>&1
  if errorlevel 1 (
    call :fail 1
    exit /b 1
  )

  set "CURRENT_STEP=waiting for the app server"
  call :log "INFO Waiting for app health."
  call :run_powershell -NoProfile -Command "$ProgressPreference='SilentlyContinue'; $deadline=(Get-Date).AddSeconds(30); do { try { $response = Invoke-WebRequest -UseBasicParsing -Uri 'http://localhost:!APP_PORT!/api/health' -TimeoutSec 5; if ($response.StatusCode -eq 200) { $health = ConvertFrom-Json -InputObject $response.Content; if ($health.ok -eq $true) { exit 0 } } } catch {}; Start-Sleep -Milliseconds 500 } while ((Get-Date) -lt $deadline); exit 1" >>"!LAUNCHER_LOG_FILE!" 2>&1
  if errorlevel 1 (
    echo The server did not become ready within 30 seconds. Check the server window for errors.
    call :fail 1
    exit /b 1
  )
) else (
  echo App is already running. Reusing the existing instance.
)

call :log "INFO Launcher completed successfully."
start "" "!APP_URL!"
echo App launched in your browser at !APP_URL!. Close the server window to stop it.
exit /b 0

:check_app_health
call :run_powershell -NoProfile -Command "$ProgressPreference='SilentlyContinue'; try { $response = Invoke-WebRequest -UseBasicParsing -Uri 'http://localhost:%~1/api/health' -TimeoutSec 5; if ($response.StatusCode -eq 200) { $health = ConvertFrom-Json -InputObject $response.Content; if ($health.ok -eq $true) { exit 0 } } } catch {}; exit 1"
exit /b %ERRORLEVEL%

:port_is_available
call :run_powershell -NoProfile -Command "$port=[int]%~1; $occupied=$false; foreach ($address in @([Net.IPAddress]::Loopback, [Net.IPAddress]::IPv6Loopback)) { $probe=New-Object Net.Sockets.TcpListener($address, $port); try { $probe.Start() } catch { $occupied=$true } finally { $probe.Stop() } }; if ($occupied) { exit 1 }; exit 0"
exit /b %ERRORLEVEL%

:select_app_port
call :check_app_health !APP_PORT!
if not errorlevel 1 exit /b 0

call :port_is_available !APP_PORT!
if not errorlevel 1 exit /b 0

set /a NEXT_APP_PORT=!APP_PORT! + 1
set /a APP_PORT_LIMIT=!APP_PORT! + 100
:select_app_port_next
if !NEXT_APP_PORT! GEQ !APP_PORT_LIMIT! (
  echo No available local port found for Cheapest Flight Picker.
  exit /b 1
)

call :port_is_available !NEXT_APP_PORT!
if not errorlevel 1 (
  echo Port !APP_PORT! is already in use by another service. Using port !NEXT_APP_PORT! for Cheapest Flight Picker.
  set "APP_PORT=!NEXT_APP_PORT!"
  set "APP_URL=http://localhost:!APP_PORT!"
  exit /b 0
)

set /a NEXT_APP_PORT+=1
goto :select_app_port_next

:ensure_toolchain
call :refresh_path
call :bootstrap_windows_path
call :add_known_tool_paths

set "MISSING_GIT=0"
set "MISSING_NODE=0"
call :tool_available git
if errorlevel 1 set "MISSING_GIT=1"
call :tool_available node
if errorlevel 1 set "MISSING_NODE=1"
call :tool_available npm
if errorlevel 1 set "MISSING_NODE=1"

if "!MISSING_GIT!"=="0" if "!MISSING_NODE!"=="0" exit /b 0

echo Missing setup tools were detected.
set "TOOLCHAIN_INSTALLED=0"

if "!MISSING_GIT!"=="1" (
  call :install_git
  if errorlevel 1 (
    echo Failed to install Git automatically.
    echo Install Git, then run this launcher again.
    call :fail 1
    exit /b 1
  )
)

if "!MISSING_NODE!"=="1" (
  call :install_node
  if errorlevel 1 (
    echo Failed to install Node.js LTS automatically.
    echo Install Node.js LTS, then run this launcher again.
    call :fail 1
    exit /b 1
  )
)

call :refresh_path
call :bootstrap_windows_path
call :add_known_tool_paths

set "MISSING_AFTER_INSTALL=0"
call :tool_available git
if errorlevel 1 set "MISSING_AFTER_INSTALL=1"
call :tool_available node
if errorlevel 1 set "MISSING_AFTER_INSTALL=1"
call :tool_available npm
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

:install_git
echo Git was not found. Trying to install it automatically...
where winget >nul 2>nul
if not errorlevel 1 (
  echo Trying winget...
  winget install --id "Git.Git" --exact --accept-package-agreements --accept-source-agreements --silent
  if not errorlevel 1 (
    set "TOOLCHAIN_INSTALLED=1"
    exit /b 0
  )
  echo winget install failed.
)

where choco >nul 2>nul
if not errorlevel 1 (
  echo Trying Chocolatey...
  choco install git -y --no-progress
  if not errorlevel 1 (
    set "TOOLCHAIN_INSTALLED=1"
    exit /b 0
  )
  echo Chocolatey install failed.
)

where scoop >nul 2>nul
if not errorlevel 1 (
  echo Trying Scoop...
  scoop install git
  if not errorlevel 1 (
    set "TOOLCHAIN_INSTALLED=1"
    exit /b 0
  )
  echo Scoop install failed.
)

echo Downloading Git for Windows installer from the official source...
call :run_powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; $release=Invoke-RestMethod 'https://api.github.com/repos/git-for-windows/git/releases/latest'; $asset=$null; foreach ($candidate in $release.assets) { if ($candidate.name -match '64-bit\.exe$' -and $candidate.name -notmatch 'Portable') { $asset=$candidate; break } }; if (-not $asset) { throw 'Could not find a Git for Windows installer.' }; $installer=Join-Path $env:TEMP $asset.name; Write-Host ('Downloading ' + $asset.browser_download_url); Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $installer -UseBasicParsing; $proc=Start-Process -FilePath $installer -ArgumentList '/VERYSILENT','/NORESTART','/NOCANCEL','/SP-' -Wait -PassThru; if ($proc.ExitCode -ne 0) { exit 1 }"
if errorlevel 1 (
  call :install_git_with_curl
  if errorlevel 1 exit /b 1
)
if not errorlevel 1 (
  set "TOOLCHAIN_INSTALLED=1"
  exit /b 0
)
exit /b 1

:install_node
echo Node.js or npm was not found. Trying to install Node.js LTS automatically...
where winget >nul 2>nul
if not errorlevel 1 (
  echo Trying winget...
  winget install --id "OpenJS.NodeJS.LTS" --exact --accept-package-agreements --accept-source-agreements --silent
  if not errorlevel 1 (
    set "TOOLCHAIN_INSTALLED=1"
    exit /b 0
  )
  echo winget install failed.
)

where choco >nul 2>nul
if not errorlevel 1 (
  echo Trying Chocolatey...
  choco install nodejs-lts -y --no-progress
  if not errorlevel 1 (
    set "TOOLCHAIN_INSTALLED=1"
    exit /b 0
  )
  echo Chocolatey install failed.
)

where scoop >nul 2>nul
if not errorlevel 1 (
  echo Trying Scoop...
  scoop install nodejs-lts
  if not errorlevel 1 (
    set "TOOLCHAIN_INSTALLED=1"
    exit /b 0
  )
  echo Scoop install failed.
)

echo Downloading Node.js LTS installer from nodejs.org...
call :install_node_direct
if errorlevel 1 exit /b 1
set "TOOLCHAIN_INSTALLED=1"
exit /b 0

:install_node_direct
call :bootstrap_windows_path
set "LAUNCHER_DIR=%~dp0"
if "%LAUNCHER_DIR:~-1%"=="\" set "LAUNCHER_DIR=%LAUNCHER_DIR:~0,-1%"
if not defined POWERSHELL_EXE call :resolve_powershell
call :ensure_node_ps1_scripts
if errorlevel 1 exit /b 1

where curl >nul 2>nul
if not errorlevel 1 (
  call :resolve_node_lts_version
  if not defined NODE_VERSION set "NODE_VERSION=v24.18.0"
  if defined NODE_VERSION (
    set "NODE_MSI=%TEMP%\node-!NODE_VERSION!-x64.msi"
    echo Downloading Node.js !NODE_VERSION! with curl...
    curl -fsSL -H "User-Agent: SetupLauncher/1.0" -o "!NODE_MSI!" "https://nodejs.org/dist/!NODE_VERSION!/node-!NODE_VERSION!-x64.msi"
    if not errorlevel 1 if exist "!NODE_MSI!" (
      msiexec /i "!NODE_MSI!" /quiet /norestart
      if errorlevel 3010 exit /b 0
      if not errorlevel 1 exit /b 0
    )
  )
)

if not defined POWERSHELL_EXE (
  echo PowerShell is required to install Node.js on this machine.
  exit /b 1
)

"%POWERSHELL_EXE%" -NoProfile -ExecutionPolicy Bypass -File "!NODE_INSTALL_PS1!"
exit /b %ERRORLEVEL%

:resolve_node_lts_version
set "NODE_VERSION="
if not defined POWERSHELL_EXE exit /b 1
if not defined NODE_RESOLVE_PS1 call :ensure_node_ps1_scripts
for /f "delims=" %%V in ('"%POWERSHELL_EXE%" -NoProfile -ExecutionPolicy Bypass -File "!NODE_RESOLVE_PS1!"') do (
  set "NODE_VERSION=%%V"
  goto :node_version_resolved
)
:node_version_resolved
exit /b 0

:ensure_node_ps1_scripts
if not defined NODE_SIDECAR_DIR (
  if defined LAUNCHER_DIR set "NODE_SIDECAR_DIR=!LAUNCHER_DIR!"
  if defined TOOLCHAIN_DIR set "NODE_SIDECAR_DIR=!TOOLCHAIN_DIR!"
)
if exist "!NODE_SIDECAR_DIR!\install-node-lts.ps1" if exist "!NODE_SIDECAR_DIR!\resolve-node-lts.ps1" (
  set "NODE_INSTALL_PS1=!NODE_SIDECAR_DIR!\install-node-lts.ps1"
  set "NODE_RESOLVE_PS1=!NODE_SIDECAR_DIR!\resolve-node-lts.ps1"
  exit /b 0
)
if exist "!LAUNCHER_DIR!\install-node-lts.ps1" if exist "!LAUNCHER_DIR!\resolve-node-lts.ps1" (
  set "NODE_INSTALL_PS1=!LAUNCHER_DIR!\install-node-lts.ps1"
  set "NODE_RESOLVE_PS1=!LAUNCHER_DIR!\resolve-node-lts.ps1"
  exit /b 0
)
set "NODE_SCRIPT_DIR=%TEMP%\setup-launcher-node"
if exist "!NODE_SCRIPT_DIR!" rmdir /s /q "!NODE_SCRIPT_DIR!"
mkdir "!NODE_SCRIPT_DIR!"
set "NODE_INSTALL_PS1=!NODE_SCRIPT_DIR!\install-node-lts.ps1"
set "NODE_RESOLVE_PS1=!NODE_SCRIPT_DIR!\resolve-node-lts.ps1"
call :write_embedded_node_install_ps1 "!NODE_INSTALL_PS1!"
if errorlevel 1 exit /b 1
call :write_embedded_node_resolve_ps1 "!NODE_RESOLVE_PS1!"
if errorlevel 1 exit /b 1
if not exist "!NODE_INSTALL_PS1!" exit /b 1
if not exist "!NODE_RESOLVE_PS1!" exit /b 1
copy /Y "!NODE_INSTALL_PS1!" "!LAUNCHER_DIR!\install-node-lts.ps1" >nul 2>&1
copy /Y "!NODE_RESOLVE_PS1!" "!LAUNCHER_DIR!\resolve-node-lts.ps1" >nul 2>&1
exit /b 0

:decode_embedded_ps1
if not defined POWERSHELL_EXE call :resolve_powershell
if not defined NODE_EMBED_B64 exit /b 1
if "%~1"=="" exit /b 1
set "NODE_DECODE_OUT=%~1"
"%POWERSHELL_EXE%" -NoProfile -Command "& { [IO.File]::WriteAllText($env:NODE_DECODE_OUT, [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($env:NODE_EMBED_B64))) }"
if errorlevel 1 exit /b 1
if not exist "%~1" exit /b 1
exit /b 0

:write_embedded_node_install_ps1
if not defined POWERSHELL_EXE call :resolve_powershell
if exist "!LAUNCHER_DIR!\install-node-lts.ps1" (
  copy /Y "!LAUNCHER_DIR!\install-node-lts.ps1" "%~1" >nul
  exit /b 0
)
set "NODE_EMBED_B64=JEVycm9yQWN0aW9uUHJlZmVyZW5jZSA9ICdTdG9wJwpbTmV0LlNlcnZpY2VQb2ludE1hbmFnZXJdOjpTZWN1cml0eVByb3RvY29sID0gW05ldC5TZWN1cml0eVByb3RvY29sVHlwZV06OlRsczEyCiR1c2VyQWdlbnQgPSAnTW96aWxsYS81LjAgKGNvbXBhdGlibGU7IFNldHVwTGF1bmNoZXIvMS4wKScKCmZ1bmN0aW9uIEdldC1Ob2RlTHRzRW50cnkgewogIHBhcmFtKAogICAgW1BhcmFtZXRlcihNYW5kYXRvcnkgPSAkdHJ1ZSldCiAgICBbb2JqZWN0W11dJEVudHJpZXMKICApCgogICRsdHNFbnRyeSA9ICRFbnRyaWVzIHwKICAgIFdoZXJlLU9iamVjdCB7ICRfLmx0cyAtaXMgW3N0cmluZ10gLWFuZCAkXy5sdHMuVHJpbSgpLkxlbmd0aCAtZ3QgMCB9IHwKICAgIFNlbGVjdC1PYmplY3QgLUZpcnN0IDEKCiAgaWYgKC1ub3QgJGx0c0VudHJ5KSB7CiAgICByZXR1cm4gJG51bGwKICB9CgogIHJldHVybiAkbHRzRW50cnkKfQoKZnVuY3Rpb24gR2V0LU5vZGVXaW5kb3dzQXJjaCB7CiAgaWYgKFtFbnZpcm9ubWVudF06OklzNjRCaXRPcGVyYXRpbmdTeXN0ZW0pIHsKICAgIGlmICgkZW52OlBST0NFU1NPUl9BUkNISVRFQ1RVUkUgLW1hdGNoICdBUk02NCcgLW9yICRlbnY6UFJPQ0VTU09SX0FSQ0hJVEVXNjQzMiAtbWF0Y2ggJ0FSTTY0JykgewogICAgICByZXR1cm4gJ2FybTY0JwogICAgfQoKICAgIHJldHVybiAneDY0JwogIH0KCiAgcmV0dXJuICd4ODYnCn0KCmZ1bmN0aW9uIFJlc29sdmUtTm9kZUx0c1ZlcnNpb24gewogIHBhcmFtKAogICAgW1BhcmFtZXRlcihNYW5kYXRvcnkgPSAkdHJ1ZSldCiAgICBbb2JqZWN0W11dJEVudHJpZXMKICApCgogICRsdHNFbnRyeSA9IEdldC1Ob2RlTHRzRW50cnkgLUVudHJpZXMgJEVudHJpZXMKICBpZiAoJGx0c0VudHJ5IC1hbmQgLW5vdCBbc3RyaW5nXTo6SXNOdWxsT3JXaGl0ZVNwYWNlKCRsdHNFbnRyeS52ZXJzaW9uKSkgewogICAgcmV0dXJuICRsdHNFbnRyeS52ZXJzaW9uLlRyaW0oKQogIH0KCiAgcmV0dXJuICd2MjQuMTguMCcKfQoKJGVudHJpZXMgPSBAKEludm9rZS1SZXN0TWV0aG9kIC1VcmkgJ2h0dHBzOi8vbm9kZWpzLm9yZy9kaXN0L2luZGV4Lmpzb24nIC1Vc2VyQWdlbnQgJHVzZXJBZ2VudCkKJHZlcnNpb24gPSBSZXNvbHZlLU5vZGVMdHNWZXJzaW9uIC1FbnRyaWVzICRlbnRyaWVzCmlmIChbc3RyaW5nXTo6SXNOdWxsT3JXaGl0ZVNwYWNlKCR2ZXJzaW9uKSkgewogIHRocm93ICdDb3VsZCBub3QgcmVzb2x2ZSBOb2RlLmpzIExUUyB2ZXJzaW9uLicKfQoKJGFyY2ggPSBHZXQtTm9kZVdpbmRvd3NBcmNoCiRtc2lOYW1lID0gIm5vZGUtJHZlcnNpb24tJGFyY2gubXNpIgokdXJsID0gImh0dHBzOi8vbm9kZWpzLm9yZy9kaXN0LyR2ZXJzaW9uLyRtc2lOYW1lIgokaW5zdGFsbGVyID0gSm9pbi1QYXRoICRlbnY6VEVNUCAkbXNpTmFtZQoKV3JpdGUtSG9zdCAiRG93bmxvYWRpbmcgJHVybCIKSW52b2tlLVdlYlJlcXVlc3QgLVVyaSAkdXJsIC1PdXRGaWxlICRpbnN0YWxsZXIgLVVzZUJhc2ljUGFyc2luZyAtVXNlckFnZW50ICR1c2VyQWdlbnQKCmlmICgtbm90IChUZXN0LVBhdGggLUxpdGVyYWxQYXRoICRpbnN0YWxsZXIpKSB7CiAgdGhyb3cgIk5vZGUuanMgaW5zdGFsbGVyIHdhcyBub3QgZG93bmxvYWRlZDogJGluc3RhbGxlciIKfQoKJHByb2MgPSBTdGFydC1Qcm9jZXNzIC1GaWxlUGF0aCAnbXNpZXhlYy5leGUnIC1Bcmd1bWVudExpc3QgQCgnL2knLCAkaW5zdGFsbGVyLCAnL3F1aWV0JywgJy9ub3Jlc3RhcnQnKSAtV2FpdCAtUGFzc1RocnUKaWYgKCRwcm9jLkV4aXRDb2RlIC1uZSAwIC1hbmQgJHByb2MuRXhpdENvZGUgLW5lIDMwMTApIHsKICBleGl0IDEKfQo="
call :decode_embedded_ps1 "%~1"
findstr /C:"Get-NodeLtsEntry" "%~1" >nul 2>&1 && exit /b 0
where curl >nul 2>nul
if not errorlevel 1 (
  curl -fsSL -H "User-Agent: SetupLauncher/1.0" -o "%~1" "https://raw.githubusercontent.com/MarsLuay/CheapestFlightPicker/main/install-node-lts.ps1"
  if not errorlevel 1 if exist "%~1" findstr /C:"Get-NodeLtsEntry" "%~1" >nul 2>&1 && exit /b 0
)
exit /b 1

:write_embedded_node_resolve_ps1
if not defined POWERSHELL_EXE call :resolve_powershell
if exist "!LAUNCHER_DIR!\resolve-node-lts.ps1" (
  copy /Y "!LAUNCHER_DIR!\resolve-node-lts.ps1" "%~1" >nul
  exit /b 0
)
set "NODE_EMBED_B64=JEVycm9yQWN0aW9uUHJlZmVyZW5jZSA9ICdTdG9wJwpbTmV0LlNlcnZpY2VQb2ludE1hbmFnZXJdOjpTZWN1cml0eVByb3RvY29sID0gW05ldC5TZWN1cml0eVByb3RvY29sVHlwZV06OlRsczEyCgpmdW5jdGlvbiBHZXQtTm9kZUx0c0VudHJ5IHsKICBwYXJhbSgKICAgIFtQYXJhbWV0ZXIoTWFuZGF0b3J5ID0gJHRydWUpXQogICAgW29iamVjdFtdXSRFbnRyaWVzCiAgKQoKICAkbHRzRW50cnkgPSAkRW50cmllcyB8CiAgICBXaGVyZS1PYmplY3QgeyAkXy5sdHMgLWlzIFtzdHJpbmddIC1hbmQgJF8ubHRzLlRyaW0oKS5MZW5ndGggLWd0IDAgfSB8CiAgICBTZWxlY3QtT2JqZWN0IC1GaXJzdCAxCgogIGlmICgtbm90ICRsdHNFbnRyeSkgewogICAgcmV0dXJuICRudWxsCiAgfQoKICByZXR1cm4gJGx0c0VudHJ5Cn0KCiRlbnRyaWVzID0gQChJbnZva2UtUmVzdE1ldGhvZCAtVXJpICdodHRwczovL25vZGVqcy5vcmcvZGlzdC9pbmRleC5qc29uJyAtVXNlckFnZW50ICdTZXR1cExhdW5jaGVyLzEuMCcpCiRsdHNFbnRyeSA9IEdldC1Ob2RlTHRzRW50cnkgLUVudHJpZXMgJGVudHJpZXMKaWYgKCRsdHNFbnRyeSAtYW5kIC1ub3QgW3N0cmluZ106OklzTnVsbE9yV2hpdGVTcGFjZSgkbHRzRW50cnkudmVyc2lvbikpIHsKICBXcml0ZS1PdXRwdXQgJGx0c0VudHJ5LnZlcnNpb24uVHJpbSgpCiAgZXhpdCAwCn0KCldyaXRlLU91dHB1dCAndjI0LjE4LjAnCg=="
call :decode_embedded_ps1 "%~1"
findstr /C:"Get-NodeLtsEntry" "%~1" >nul 2>&1 && exit /b 0
where curl >nul 2>nul
if not errorlevel 1 (
  curl -fsSL -H "User-Agent: SetupLauncher/1.0" -o "%~1" "https://raw.githubusercontent.com/MarsLuay/CheapestFlightPicker/main/resolve-node-lts.ps1"
  if not errorlevel 1 if exist "%~1" findstr /C:"Get-NodeLtsEntry" "%~1" >nul 2>&1 && exit /b 0
)
exit /b 1
:add_known_tool_paths
for %%P in (
  "%ProgramFiles%\Git\cmd"
  "%ProgramFiles%\Git\bin"
  "%ProgramFiles%\nodejs"
  "%ProgramData%\chocolatey\bin"
  "%LocalAppData%\Programs\Git\cmd"
  "%LocalAppData%\Programs\Git\bin"
  "%LocalAppData%\Programs\nodejs"
  "%USERPROFILE%\scoop\shims"
  "%USERPROFILE%\scoop\apps\git\current\cmd"
  "%USERPROFILE%\scoop\apps\git\current\bin"
) do (
  if exist "%%~P" (
    set "PATH=%%~P;!PATH!"
  )
)

exit /b 0

:tool_available
set "TOOL_NAME=%~1"
where "%TOOL_NAME%" >nul 2>nul
if not errorlevel 1 exit /b 0
if /i "%TOOL_NAME%"=="git" (
  if exist "%ProgramFiles%\Git\cmd\git.exe" exit /b 0
  if exist "%ProgramFiles%\Git\bin\git.exe" exit /b 0
  if exist "%LocalAppData%\Programs\Git\cmd\git.exe" exit /b 0
  if exist "%LocalAppData%\Programs\Git\bin\git.exe" exit /b 0
)
if /i "%TOOL_NAME%"=="node" (
  if exist "%ProgramFiles%\nodejs\node.exe" exit /b 0
  if exist "%LocalAppData%\Programs\nodejs\node.exe" exit /b 0
)
if /i "%TOOL_NAME%"=="npm" (
  if exist "%ProgramFiles%\nodejs\npm.cmd" exit /b 0
  if exist "%LocalAppData%\Programs\nodejs\npm.cmd" exit /b 0
)
exit /b 1

:bootstrap_windows_path
if exist "%SystemRoot%\System32\" (
  set "PATH=%SystemRoot%\System32;%SystemRoot%\System32\WindowsPowerShell\v1.0;%PATH%"
)
if exist "%SystemRoot%\SysWOW64\" (
  set "PATH=%SystemRoot%\SysWOW64;%PATH%"
)
exit /b 0

:resolve_powershell
set "POWERSHELL_EXE="
if exist "%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" (
  set "POWERSHELL_EXE=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"
  exit /b 0
)
if exist "%SystemRoot%\SysWOW64\WindowsPowerShell\v1.0\powershell.exe" (
  set "POWERSHELL_EXE=%SystemRoot%\SysWOW64\WindowsPowerShell\v1.0\powershell.exe"
  exit /b 0
)
where powershell >nul 2>nul
if not errorlevel 1 (
  for /f "delims=" %%P in ('where powershell 2^>nul') do (
    set "POWERSHELL_EXE=%%P"
    exit /b 0
  )
)
exit /b 0

:run_powershell
if not defined POWERSHELL_EXE (
  call :log "ERROR PowerShell was not found."
  echo PowerShell is required but was not found on this machine.
  exit /b 1
)
"%POWERSHELL_EXE%" %*
exit /b %ERRORLEVEL%

:install_git_with_curl
where curl >nul 2>nul
if errorlevel 1 (
  echo curl is required for direct downloads but was not found.
  exit /b 1
)
set "GIT_RELEASE_JSON=%TEMP%\git-release.json"
echo Resolving latest Git for Windows download with curl...
curl -fsSL -H "User-Agent: CheapestFlightPicker" "https://api.github.com/repos/git-for-windows/git/releases/latest" -o "!GIT_RELEASE_JSON!"
if errorlevel 1 exit /b 1
set "GIT_URL="
for /f "usebackq tokens=1,* delims=:" %%A in (`findstr /C:"browser_download_url" "!GIT_RELEASE_JSON!" ^| findstr /C:"64-bit.exe" ^| findstr /V /C:"Portable"`) do (
  set "GIT_URL=%%B"
)
if not defined GIT_URL exit /b 1
set "GIT_URL=!GIT_URL: =!"
set "GIT_URL=!GIT_URL:"=!"
set "GIT_URL=!GIT_URL:,=!"
set "GIT_INSTALLER=%TEMP%\Git-64-bit-installer.exe"
echo Downloading Git for Windows from !GIT_URL!
curl -fsSL -L -o "!GIT_INSTALLER!" "!GIT_URL!"
if errorlevel 1 exit /b 1
if not exist "!GIT_INSTALLER!" exit /b 1
"!GIT_INSTALLER!" /VERYSILENT /NORESTART /NOCANCEL /SP-
if errorlevel 1 exit /b 1
exit /b 0

exit /b 0

:log
if not defined LAUNCHER_LOG_FILE exit /b 0
>>"!LAUNCHER_LOG_FILE!" echo([%date% %time%] %~1
exit /b 0

:fail
set "FAIL_CODE=%~1"
if not defined FAIL_CODE set "FAIL_CODE=1"
call :log "ERROR Setup stopped with code !FAIL_CODE! during !CURRENT_STEP!."
echo.
echo Setup stopped before the app could launch.
echo Detailed launcher log: "!LAUNCHER_LOG_FILE!"
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
