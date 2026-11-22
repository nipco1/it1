[CmdletBinding()]
param(
  [ValidateSet('Standalone','Server','Client')][string]$Mode = 'Standalone',
  [string]$BaseUrl = 'https://localhost:8443',
  [string]$TargetRoot = 'C:\NIPCO\Control'
)
$ErrorActionPreference = 'Continue'
$results = [System.Collections.Generic.List[object]]::new()
function Add-Check([string]$Name,[bool]$Ok,[string]$Detail) {
  $status = if ($Ok) { 'PASS' } else { 'FAIL' }
  $results.Add([pscustomobject]@{Check=$Name;Status=$status;Detail=$Detail})
  $color = if ($Ok) { 'Green' } else { 'Red' }
  Write-Host ("[{0}] {1}: {2}" -f $status,$Name,$Detail) -ForegroundColor $color
}
Write-Host "NIPCO Control post-install verification ($Mode)" -ForegroundColor Cyan
if ($Mode -ne 'Client') {
  $service = Get-Service -Name 'NIPCOControl' -ErrorAction SilentlyContinue
  Add-Check 'Windows service' ([bool]($service -and $service.Status -eq 'Running')) $(if ($service) { [string]$service.Status } else { 'NIPCOControl service not found' })
  Add-Check 'Application files' (Test-Path (Join-Path $TargetRoot 'dist\index.html')) (Join-Path $TargetRoot 'dist\index.html')
  Add-Check 'Private configuration' ((Test-Path (Join-Path $TargetRoot '.env')) -and (Test-Path (Join-Path $TargetRoot 'secrets\server.pfx'))) 'Checks .env and TLS PFX presence; does not print secrets.'
  Add-Check 'Backup directory' (Test-Path (Join-Path $TargetRoot 'Backups')) (Join-Path $TargetRoot 'Backups')
  $task = Get-ScheduledTask -TaskName 'NIPCO Control Daily SQL Backup' -ErrorAction SilentlyContinue
  Add-Check 'Daily backup task' ([bool]($task -and $task.State -ne 'Disabled')) $(if ($task) { [string]$task.State } else { 'Scheduled task not found' })
}
try {
  $uri = [Uri]$BaseUrl
  if ($uri.Scheme -ne 'https') { throw 'The application URL must use HTTPS.' }
  $tcp = Test-NetConnection -ComputerName $uri.DnsSafeHost -Port $uri.Port -WarningAction SilentlyContinue
  Add-Check 'HTTPS TCP port' ([bool]$tcp.TcpTestSucceeded) ("{0}:{1}" -f $uri.DnsSafeHost,$uri.Port)
  $health = Invoke-RestMethod -Uri ($BaseUrl.TrimEnd('/') + '/api/health') -Method Get -TimeoutSec 15
  Add-Check 'API and SQL health' ([bool]($health.ok -eq $true -and $health.database -eq 'connected')) ("ok={0}; database={1}" -f $health.ok,$health.database)
} catch { Add-Check 'API and SQL health' $false $_.Exception.Message }
Write-Host ''
$failed = @($results | Where-Object Status -eq 'FAIL').Count
Write-Host ("نتیجه: {0} موفق، {1} ناموفق" -f ($results.Count-$failed),$failed) -ForegroundColor Cyan
if ($failed -gt 0) { Write-Host 'VERIFICATION FAILED. لاگ‌های نصب و سرویس را بررسی کنید.' -ForegroundColor Red; exit 2 }
Write-Host 'BASIC VERIFICATION PASSED. این آزمون جایگزین آزمون چندکاربره و Restore واقعی نیست.' -ForegroundColor Yellow
exit 0
