# start-session Edge Function 배포 (Supabase 계정 토큰 필요)
# 1) https://supabase.com/dashboard/account/tokens 에서 토큰 생성
# 2) PowerShell:
#    $env:SUPABASE_ACCESS_TOKEN = "sbp_...."
#    .\scripts\deploy-start-session.ps1

$ErrorActionPreference = "Stop"
$ProjectRef = "csaxusqovxuquvlalzld"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $Root

if (-not $env:SUPABASE_ACCESS_TOKEN) {
  Write-Host "SUPABASE_ACCESS_TOKEN 이 없습니다." -ForegroundColor Yellow
  Write-Host "대시보드 → Account → Access Tokens 에서 생성 후:"
  Write-Host '  $env:SUPABASE_ACCESS_TOKEN = "sbp_..."'
  Write-Host "  .\scripts\deploy-start-session.ps1"
  Write-Host ""
  Write-Host "또는: npm run supabase:login 후 npm run deploy:start-session"
  exit 1
}

npx supabase functions deploy start-session --project-ref $ProjectRef
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Host "Deployed: https://${ProjectRef}.supabase.co/functions/v1/start-session" -ForegroundColor Green
