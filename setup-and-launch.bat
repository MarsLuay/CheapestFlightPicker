@echo off
setlocal EnableDelayedExpansion
call :bootstrap_windows_path
call :resolve_powershell
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
call :run_powershell -NoProfile -Command "try { $response = Invoke-WebRequest -UseBasicParsing http://localhost:8787/api/health; if ($response.StatusCode -eq 200) { exit 0 } } catch {}; exit 1"
if errorlevel 1 (
  echo Launching app...
  set "APP_LAUNCH_DIR=%CD%"
  call :run_powershell -NoProfile -Command "Start-Process -FilePath 'cmd.exe' -WorkingDirectory $env:APP_LAUNCH_DIR -ArgumentList '/k','npm start' | Out-Null"
  if errorlevel 1 (
    call :fail 1
    exit /b 1
  )

  call :run_powershell -NoProfile -Command "$ProgressPreference='SilentlyContinue'; $deadline=(Get-Date).AddSeconds(30); do { try { $response = Invoke-WebRequest -UseBasicParsing http://localhost:8787/api/health; if ($response.StatusCode -eq 200) { exit 0 } } catch {}; Start-Sleep -Milliseconds 500 } while ((Get-Date) -lt $deadline); exit 1"
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
call :run_powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; $release=Invoke-RestMethod 'https://api.github.com/repos/git-for-windows/git/releases/latest'; $asset=$release.assets | Where-Object { $_.name -match '64-bit\.exe$' -and $_.name -notmatch 'Portable' } | Select-Object -First 1; if (-not $asset) { throw 'Could not find a Git for Windows installer.' }; $installer=Join-Path $env:TEMP $asset.name; Write-Host ('Downloading ' + $asset.browser_download_url); Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $installer -UseBasicParsing; $proc=Start-Process -FilePath $installer -ArgumentList '/VERYSILENT','/NORESTART','/NOCANCEL','/SP-' -Wait -PassThru; if ($proc.ExitCode -ne 0) { exit 1 }"
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
call :run_powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; $version=(Invoke-RestMethod 'https://nodejs.org/dist/index.json' | Where-Object { $_.lts -and $_.lts -ne $false } | Select-Object -First 1).version; $msiName=\"node-$version-x64.msi\"; $url=\"https://nodejs.org/dist/$version/$msiName\"; $installer=Join-Path $env:TEMP $msiName; Invoke-WebRequest -Uri $url -OutFile $installer -UseBasicParsing; $proc=Start-Process -FilePath 'msiexec.exe' -ArgumentList '/i', $installer, '/quiet', '/norestart' -Wait -PassThru; if ($proc.ExitCode -ne 0 -and $proc.ExitCode -ne 3010) { exit 1 }"
if errorlevel 1 (
  call :install_node_with_curl
  if errorlevel 1 exit /b 1
)
if not errorlevel 1 (
  set "TOOLCHAIN_INSTALLED=1"
  exit /b 0
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

:install_node_with_curl
where curl >nul 2>nul
if errorlevel 1 (
  echo curl is required for direct downloads but was not found.
  exit /b 1
)
set "NODE_VERSION=v22.14.0"
if defined POWERSHELL_EXE (
  for /f "usebackq delims=" %%V in (`"%POWERSHELL_EXE%" -NoProfile -Command "(Invoke-RestMethod 'https://nodejs.org/dist/index.json' | Where-Object { $_.lts } | Select-Object -First 1).version"`) do set "NODE_VERSION=%%V"
) else (
  for /f "usebackq delims=" %%V in (`curl -fsSL https://nodejs.org/dist/index.json ^| findstr /C:"\"lts\":" /C:"\"version\":"`) do set "NODE_JSON=%%V"
)
set "NODE_MSI=%TEMP%\node-!NODE_VERSION!-x64.msi"
echo Downloading Node.js !NODE_VERSION! with curl...
curl -fsSL -o "!NODE_MSI!" "https://nodejs.org/dist/!NODE_VERSION!/node-!NODE_VERSION!-x64.msi"
if errorlevel 1 exit /b 1
if not exist "!NODE_MSI!" exit /b 1
msiexec /i "!NODE_MSI!" /quiet /norestart
if errorlevel 3010 exit /b 0
if errorlevel 1 exit /b 1
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
