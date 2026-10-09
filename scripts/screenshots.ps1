# screenshots.ps1 — render assets/*.svg -> assets/screenshots/*.png (steady state).
# Captures the ANIMATED cards at a settled frame via --virtual-time-budget, so
# every entrance animation (delay ... both) has landed before the shot.
# Run from the repo root:  powershell -File scripts/screenshots.ps1
# Renderer: msedge --headless (same recipe as .github/workflows/og.yml).
# -Only <name> renders a single shot (flow|hero|demo|stats|disclosure|site) —
# stats.mjs uses this to refresh site.png after its last index.html write.
param([string]$Only = '')
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$edge = @(
  'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',
  'C:\Program Files\Microsoft\Edge\Application\msedge.exe'
) | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $edge) { Write-Error 'msedge.exe not found - Edge is the renderer (og.yml recipe)'; exit 1 }

$out = Join-Path $root 'assets\screenshots'
New-Item -ItemType Directory -Force -Path $out | Out-Null
$shots = @(
  @{ n = 'flow';        src = 'assets\flow.svg';             w = 1200; h = 620 },
  @{ n = 'hero';        src = 'assets\aio-hero.svg';         w = 1200; h = 640 },
  @{ n = 'demo';        src = 'assets\aio-demo.svg';         w = 1200; h = 560 },
  @{ n = 'stats';       src = 'assets\aio-stats.svg';        w = 1200; h = 300 },
  @{ n = 'disclosure';  src = 'assets\aio-disclosure.svg';   w = 1200; h = 420 }
)
if ($Only -eq 'site') { $shots = @() }
elseif ($Only) { $shots = @($shots | Where-Object { $_.n -eq $Only }) }

foreach ($s in $shots) {
  $html = 'file:///' + ((Resolve-Path (Join-Path $root $s.src)).Path -replace '\\', '/')
  $png = Join-Path $out "$($s.n).png"
  # unique profile per shot: a shared --user-data-dir makes headless runs race
  # each other (stale session swallows SMIL — the disclosure clip stays at 0).
  # profiles are wiped every run so a previous capture can never serve stale
  # bytes from the HTTP cache (that is how a pre-wrap fix once went invisible).
  # Also wipe BEFORE every retry: a frozen attempt leaves a poisoned session
  # behind and the next try would inherit it (clip stuck at 0, three times).
  $prof = "$env:TEMP\edge-aio-shots-$($s.n)"
  # the disclosure card's SMIL typewriter occasionally misses the budget and
  # freezes at clip-width 0 (PNG ~10 KB instead of ~11.6 KB) — retry on size.
  $try = 0
  do {
    $try++
    if ($try -gt 1) { Start-Sleep -Milliseconds 1200 }
    Remove-Item -Recurse -Force -ErrorAction SilentlyContinue -LiteralPath $prof
    Start-Process -FilePath $edge -ArgumentList @(
      '--headless=new', '--disable-gpu', '--no-sandbox',
      "--user-data-dir=$prof",
      '--virtual-time-budget=14000',
      "--screenshot=$png",
      "--window-size=$($s.w),$($s.h)",
      $html
    ) -Wait -NoNewWindow | Out-Null
    $ok = -not (Test-Path $png) -or (Get-Item $png).Length -ge 11000
  } while ($s.n -eq 'disclosure' -and -not $ok -and $try -lt 3)
  if (-not $ok -and $s.n -eq 'disclosure') { Write-Error "FAIL disclosure (typewriter clip stuck, $((Get-Item $png).Length) bytes after $try tries)"; exit 1 }
  if (Test-Path $png) { Write-Output "OK  $($s.n).png  $((Get-Item $png).Length) bytes" }
  else { Write-Error "FAIL $($s.n)"; exit 1 }
}

# site.png — full-page capture over http:// so the proof section can fetch
# docs/stats.json (file:// blocks fetch). Needs python on PATH; skipped if absent.
$py = if (-not $Only -or $Only -eq 'site') { Get-Command python, py -ErrorAction SilentlyContinue | Select-Object -First 1 }
if ($py) {
  $srv = Start-Process -FilePath $py.Source -ArgumentList '-m', 'http.server', '8125', '--bind', '127.0.0.1' `
    -WorkingDirectory $root -PassThru -WindowStyle Hidden
  Start-Sleep -Seconds 2
  try {
    $png = Join-Path $out 'site.png'
    $siteProf = "$env:TEMP\edge-aio-shots-site"
    Remove-Item -Recurse -Force -ErrorAction SilentlyContinue -LiteralPath $siteProf
    Start-Process -FilePath $edge -ArgumentList @(
      '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
      "--user-data-dir=$siteProf",
      '--virtual-time-budget=30000',
      "--screenshot=$png",
      '--window-size=1200,6400',
      'http://127.0.0.1:8125/index.html'
    ) -Wait -NoNewWindow | Out-Null
    Start-Sleep -Milliseconds 500
    if (Test-Path $png) { Write-Output "OK  site.png  $((Get-Item $png).Length) bytes" }
    else { Write-Error 'FAIL site'; exit 1 }
  }
  finally { Stop-Process -Id $srv.Id -Force -ErrorAction SilentlyContinue }
}
else { if (-not $Only -or $Only -eq 'site') { Write-Output 'skip site.png (python not on PATH)' } }
Write-Output "screenshots written to assets\screenshots"
