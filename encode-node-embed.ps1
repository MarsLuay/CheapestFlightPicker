$root = $PSScriptRoot
$install = Get-Content (Join-Path $root 'install-node-lts.ps1') -Raw
$resolve = Get-Content (Join-Path $root 'resolve-node-lts.ps1') -Raw
@{
  install = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($install))
  resolve = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($resolve))
} | ConvertTo-Json -Compress
