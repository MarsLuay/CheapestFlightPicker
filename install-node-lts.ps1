$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$userAgent = 'Mozilla/5.0 (compatible; SetupLauncher/1.0)'

function Get-NodeLtsEntry {
  param(
    [Parameter(Mandatory = $true)]
    [object[]]$Entries
  )

  $ltsEntry = $Entries |
    Where-Object { $_.lts -is [string] -and $_.lts.Trim().Length -gt 0 } |
    Select-Object -First 1

  if (-not $ltsEntry) {
    return $null
  }

  return $ltsEntry
}

function Get-NodeWindowsArch {
  if ([Environment]::Is64BitOperatingSystem) {
    if ($env:PROCESSOR_ARCHITECTURE -match 'ARM64' -or $env:PROCESSOR_ARCHITEW6432 -match 'ARM64') {
      return 'arm64'
    }

    return 'x64'
  }

  return 'x86'
}

function Resolve-NodeLtsVersion {
  param(
    [Parameter(Mandatory = $true)]
    [object[]]$Entries
  )

  $ltsEntry = Get-NodeLtsEntry -Entries $Entries
  if ($ltsEntry -and -not [string]::IsNullOrWhiteSpace($ltsEntry.version)) {
    return $ltsEntry.version.Trim()
  }

  return 'v24.18.0'
}

$entries = @(Invoke-RestMethod -Uri 'https://nodejs.org/dist/index.json' -UserAgent $userAgent)
$version = Resolve-NodeLtsVersion -Entries $entries
if ([string]::IsNullOrWhiteSpace($version)) {
  throw 'Could not resolve Node.js LTS version.'
}

$arch = Get-NodeWindowsArch
$msiName = "node-$version-$arch.msi"
$url = "https://nodejs.org/dist/$version/$msiName"
$installer = Join-Path $env:TEMP $msiName

Write-Host "Downloading $url"
Invoke-WebRequest -Uri $url -OutFile $installer -UseBasicParsing -UserAgent $userAgent

if (-not (Test-Path -LiteralPath $installer)) {
  throw "Node.js installer was not downloaded: $installer"
}

$proc = Start-Process -FilePath 'msiexec.exe' -ArgumentList @('/i', $installer, '/quiet', '/norestart') -Wait -PassThru
if ($proc.ExitCode -ne 0 -and $proc.ExitCode -ne 3010) {
  exit 1
}
