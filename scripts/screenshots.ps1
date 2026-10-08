# screenshots.ps1 — render assets/*.svg -> assets/screenshots/*.png (steady state).
# Captures the ANIMATED cards at a settled frame via --virtual-time-budget, so
# every entrance animation (delay ... both) has landed before the shot.
# Run from the repo root:  powershell -File scripts/screenshots.ps1
# Renderer: msedge --headless (same recipe as .github/workflows/og.yml).
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

foreach ($s in $shots) {
  $html = 'file:///' + ((Resolve-Path (Join-Path $root $s.src)).Path -replace '\\', '/')
  $png = Join-Path $out "$($s.n).png"
  Start-Process -FilePath $edge -ArgumentList @(
    '--headless=new', '--disable-gpu', '--no-sandbox',
    "--user-data-dir=$env:TEMP\edge-aio-shots",
    '--virtual-time-budget=9000',
    "--screenshot=$png",
    "--window-size=$($s.w),$($s.h)",
    $html
  ) -Wait -NoNewWindow | Out-Null
  Start-Sleep -Milliseconds 800
  if (Test-Path $png) { Write-Output "OK  $($s.n).png  $((Get-Item $png).Length) bytes" }
  else { Write-Error "FAIL $($s.n)"; exit 1 }
}

# site.png — full-page capture over http:// so the proof section can fetch
# docs/stats.json (file:// blocks fetch). Needs python on PATH; skipped if absent.
$py = (Get-Command python, py -ErrorAction SilentlyContinue | Select-Object -First 1)
if ($py) {
  $srv = Start-Process -FilePath $py.Source -ArgumentList '-m', 'http.server', '8125', '--bind', '127.0.0.1' `
    -WorkingDirectory $root -PassThru -WindowStyle Hidden
  Start-Sleep -Seconds 2
  try {
    $png = Join-Path $out 'site.png'
    Start-Process -FilePath $edge -ArgumentList @(
      '--headless=new', '--disable-gpu', '--no-sandbox',
      "--user-data-dir=$env:TEMP\edge-aio-shots",
      '--virtual-time-budget=7000',
      "--screenshot=$png",
      '--window-size=1200,3400',
      'http://127.0.0.1:8125/index.html'
    ) -Wait -NoNewWindow | Out-Null
    Start-Sleep -Milliseconds 500
    if (Test-Path $png) { Write-Output "OK  site.png  $((Get-Item $png).Length) bytes" }
    else { Write-Error 'FAIL site'; exit 1 }
  }
  finally { Stop-Process -Id $srv.Id -Force -ErrorAction SilentlyContinue }
}
else { Write-Output 'skip site.png (python not on PATH)' }
Write-Output "screenshots written to assets\screenshots"
