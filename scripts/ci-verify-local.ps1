# Local checks matching GitLab CI verify job: npm ci, lint, typecheck, build.
# Run from agent-app root:  .\scripts\ci-verify-local.ps1

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $Root

$env:NPM_CONFIG_REGISTRY = "https://registry.npmmirror.com"
$env:NEXT_TELEMETRY_DISABLED = "1"
if (-not $env:NEXT_PUBLIC_CONVEX_URL) { $env:NEXT_PUBLIC_CONVEX_URL = "https://build-placeholder.convex.cloud" }
if (-not $env:NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) {
  $env:NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = "pk_test_Y2xlcmsuZXhhbXBsZS5kZXYk"
}
if (-not $env:CLERK_SECRET_KEY) { $env:CLERK_SECRET_KEY = "sk_test_ci_placeholder_replace_in_gitlab_variables" }

Write-Host "[ci-verify-local] npm ci" -ForegroundColor Cyan
npm ci
Write-Host "[ci-verify-local] npm run lint" -ForegroundColor Cyan
npm run lint
Write-Host "[ci-verify-local] npm run typecheck" -ForegroundColor Cyan
npm run typecheck
Write-Host "[ci-verify-local] npm run build" -ForegroundColor Cyan
npm run build
Write-Host "[ci-verify-local] OK." -ForegroundColor Green
