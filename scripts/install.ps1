# install.ps1 — aio Windows installer (standalone binary, NO Node required).
# Explicit download-then-run — nothing remote is piped into a shell:
#   iwr https://github.com/MRaihan-XXL/all-in-one/releases/latest/download/install.ps1 -OutFile install.ps1
#   powershell -ExecutionPolicy Bypass -File install.ps1
# Assets are SHA256-verified against the release's SHA256SUMS before they land.
param(
  [string]$Version = '', # empty = latest release (vX.Y.Z accepted with or without the v)
  [string]$InstallDir = (Join-Path $env:LOCALAPPDATA 'Programs\aio')
)
$ErrorActionPreference = 'Stop'
$repo = 'MRaihan-XXL/all-in-one'
$asset = 'aio-windows-x64.exe'

if ($Version) {
  $tag = if ($Version.StartsWith('v')) { $Version } else { "v$Version" }
} else {
  $tag = (Invoke-RestMethod -Uri "https://api.github.com/repos/$repo/releases/latest").tag_name
}
$base = "https://github.com/$repo/releases/download/$tag"
Write-Host "installing aio $tag -> $InstallDir"

New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
$exe = Join-Path $InstallDir 'aio.exe'
$tmp = Join-Path $env:TEMP ("aio-install-" + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force -Path $tmp | Out-Null
try {
  Invoke-WebRequest -Uri "$base/SHA256SUMS" -OutFile (Join-Path $tmp 'SHA256SUMS') -UseBasicParsing
  Invoke-WebRequest -Uri "$base/$asset" -OutFile (Join-Path $tmp $asset) -UseBasicParsing

  $want = ((Get-Content (Join-Path $tmp 'SHA256SUMS')) -match [regex]::Escape($asset) | Select-Object -First 1) -replace '\s+.*$', ''
  $got = (Get-FileHash -Algorithm SHA256 (Join-Path $tmp $asset)).Hash.ToLower()
  if (-not $want) { throw "SHA256SUMS has no entry for $asset — release may be mid-upload; retry later" }
  if ($want.ToLower() -ne $got) { throw "SHA256 MISMATCH for $asset (want $want got $got) — nothing installed" }

  Move-Item -Force (Join-Path $tmp $asset) $exe
} finally {
  Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
}

# user PATH: add the install dir only when missing (nothing else touched).
# GetEnvironmentVariable returns $null when the account has NO user PATH —
# coerce to string first or TrimEnd throws after the binary is already installed.
$userPath = [string][Environment]::GetEnvironmentVariable('Path', 'User')
if ($userPath -notlike "*$InstallDir*") {
  $newPath = if ($userPath.TrimEnd(';')) { $userPath.TrimEnd(';') + ';' + $InstallDir } else { $InstallDir }
  [Environment]::SetEnvironmentVariable('Path', $newPath, 'User')
  Write-Host "added to user PATH (open a new shell to pick it up): $InstallDir"
}

& $exe --version
Write-Host @"

next:  restart your shell, then run ``aio``
remove: delete $InstallDir + the PATH entry, or ``aio rollback`` first if you ran setup
scoop:  iwr "$base/aio-scoop.json" -OutFile aio-scoop.json; scoop install .\aio-scoop.json
"@
