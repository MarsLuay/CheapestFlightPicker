$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

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

$entries = @(Invoke-RestMethod -Uri 'https://nodejs.org/dist/index.json' -UserAgent 'SetupLauncher/1.0')
$ltsEntry = Get-NodeLtsEntry -Entries $entries
if ($ltsEntry -and -not [string]::IsNullOrWhiteSpace($ltsEntry.version)) {
  Write-Output $ltsEntry.version.Trim()
  exit 0
}

Write-Output 'v24.18.0'
