# One-shot dev setup: npm install → typecheck → run every smoke test.
#
# Use from a fresh clone or when something feels off:
#   pwsh scripts/setup.ps1
# or from PowerShell already in mc-v2-electron/:
#   .\scripts\setup.ps1
#
# Exits non-zero on the first failure so CI / automation can chain it.

$ErrorActionPreference = "Stop"

# Anchor to the repo root regardless of where the script was invoked from.
$repoRoot = Split-Path -Parent (Split-Path -Parent $PSCommandPath)
Set-Location $repoRoot
Write-Host "Working in $repoRoot" -ForegroundColor DarkGray

# ── install ──────────────────────────────────────────────────────────────
Write-Host "`n→ npm install" -ForegroundColor Cyan
npm install
if ($LASTEXITCODE -ne 0) { throw "npm install failed" }

# ── typecheck (both sides) ───────────────────────────────────────────────
Write-Host "`n→ typecheck" -ForegroundColor Cyan
npm run typecheck
if ($LASTEXITCODE -ne 0) { throw "typecheck failed" }

# ── smokes — every file at src/main/*.smoke.ts ───────────────────────────
Write-Host "`n→ smoke tests" -ForegroundColor Cyan
$smokes = @(
  "src/main/store.smoke.ts",
  "src/main/project-store.smoke.ts",
  "src/main/workflows.smoke.ts",
  "src/main/agent-loader.smoke.ts",
  "src/main/model-roster.smoke.ts",
  "src/main/git-detect.smoke.ts"
)

$allGreen = $true
foreach ($s in $smokes) {
  Write-Host "  - $s" -NoNewline
  $output = node --experimental-strip-types $s 2>&1
  if ($LASTEXITCODE -eq 0 -and ($output -match "GREEN")) {
    Write-Host "  GREEN" -ForegroundColor Green
  } else {
    Write-Host "  FAILED" -ForegroundColor Red
    Write-Host $output
    $allGreen = $false
  }
}

if (-not $allGreen) {
  throw "one or more smokes failed"
}

Write-Host "`nAll green. Ready for `npm run dev`." -ForegroundColor Green
Write-Host "  - UI smoke (needs `npm run build` first): node scripts/verify-ui.mjs"
