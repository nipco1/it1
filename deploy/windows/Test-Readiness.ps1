[CmdletBinding()]
param(
  [ValidateSet('Standalone','Server')][string]$Mode = 'Standalone',
  [string]$SqlExpressInstaller = '',
  [string]$SqlInstance = '',
  [int]$HttpsPort = 8443
)
$ErrorActionPreference = 'Continue'
$script:Results = [System.Collections.Generic.List[object]]::new()
function Add-Result([string]$Name, [string]$Status, [string]$Detail) {
  $script:Results.Add([pscustomobject]@{ Check=$Name; Status=$Status; Detail=$Detail })
  $color = switch ($Status) { 'PASS' {'Green'} 'WARN' {'Yellow'} default {'Red'} }
  Write-Host ("[{0}] {1}: {2}" -f $Status,$Name,$Detail) -ForegroundColor $color
}
Write-Host "NIPCO Control - Windows preflight (Mode: $Mode)" -ForegroundColor Cyan
Write-Host 'این ابزار فقط پیش‌نیازها را بررسی می‌کند و هیچ چیزی نصب یا تغییر نمی‌دهد.' -ForegroundColor Yellow
try {
  $identity=[Security.Principal.WindowsIdentity]::GetCurrent(); $principal=New-Object Security.Principal.WindowsPrincipal($identity)
  if ($principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { Add-Result 'Administrator rights' 'PASS' 'PowerShell elevated' } else { Add-Result 'Administrator rights' 'FAIL' 'PowerShell را با Run as administrator باز کنید.' }
} catch { Add-Result 'Administrator rights' 'FAIL' $_.Exception.Message }
if ($PSVersionTable.PSVersion.Major -ge 5) { Add-Result 'Windows PowerShell' 'PASS' $PSVersionTable.PSVersion.ToString() } else { Add-Result 'Windows PowerShell' 'FAIL' 'Windows PowerShell 5.1 یا جدیدتر لازم است.' }
try {
  $os = Get-CimInstance Win32_OperatingSystem -ErrorAction Stop; $caption = [string]$os.Caption; $build = [int]$os.BuildNumber; $isServer = $caption -match 'Windows Server'
  if ($Mode -eq 'Server' -and -not $isServer) { Add-Result 'Operating system' 'FAIL' "حالت Server به Windows Server نیاز دارد؛ سیستم فعلی: $caption ($build)" }
  elseif ($Mode -eq 'Standalone' -and $caption -notmatch 'Windows 10|Windows 11') { Add-Result 'Operating system' 'FAIL' "حالت Standalone فقط برای Windows 10/11 است؛ سیستم فعلی: $caption" }
  else { Add-Result 'Operating system' 'PASS' "$caption (build $build)" }
} catch { Add-Result 'Operating system' 'FAIL' $_.Exception.Message }
try {
  $node = (Get-Command node.exe -ErrorAction Stop).Source; $nodeVersion = (& $node --version 2>$null).Trim()
  $nodeArch = (& $node -p 'process.arch' 2>$null).Trim()
  if ($nodeArch -eq 'x64' -and $nodeVersion -match '^v(\d+)\.(\d+)\.(\d+)$' -and ([int]$Matches[1] -gt 22 -or ([int]$Matches[1] -eq 22 -and [int]$Matches[2] -ge 12))) { Add-Result 'Node.js' 'PASS' "$nodeVersion ($nodeArch) at $node" }
  else { Add-Result 'Node.js' 'FAIL' "حداقل Node.js نسخه 22.12 لازم است؛ نسخه فعلی: $nodeVersion" }
} catch { Add-Result 'Node.js' 'FAIL' 'node.exe پیدا نشد؛ ابتدا Node.js 26 LTS x64 یا نسخه پشتیبانی‌شده جدیدتر را نصب کنید؛ حداقل فنی 22.12 است.' }
try { $npm = (Get-Command npm.cmd -ErrorAction Stop).Source; $npmVersion = (& $npm --version 2>$null).Trim(); Add-Result 'npm' 'PASS' "$npmVersion at $npm" }
catch { Add-Result 'npm' 'FAIL' 'npm.cmd پیدا نشد.' }
$sqlServices = @(Get-Service -ErrorAction SilentlyContinue | Where-Object { $_.Name -eq 'MSSQLSERVER' -or $_.Name -like 'MSSQL$*' })
if ($SqlInstance) {
  $wantedSqlService = if ($SqlInstance -eq 'MSSQLSERVER') { 'MSSQLSERVER' } else { 'MSSQL$' + $SqlInstance }
  $selectedSql = Get-Service -Name $wantedSqlService -ErrorAction SilentlyContinue
  if ($selectedSql -and $selectedSql.Status -eq 'Running') { Add-Result 'SQL Server Database Engine' 'PASS' $selectedSql.Name }
  elseif ($selectedSql) { Add-Result 'SQL Server Database Engine' 'WARN' "$($selectedSql.Name) نصب است ولی متوقف است؛ نصب‌کننده تلاش می‌کند آن را راه‌اندازی کند." }
  elseif ($SqlInstance -eq 'SQLEXPRESS' -and $SqlExpressInstaller -and (Test-Path -LiteralPath $SqlExpressInstaller -PathType Leaf) -and [IO.Path]::GetFileName($SqlExpressInstaller) -ieq 'setup.exe') { Add-Result 'SQL Server Database Engine' 'PASS' "رسانه کامل Setup برای SQL Express موجود است: $SqlExpressInstaller" }
  else { Add-Result 'SQL Server Database Engine' 'FAIL' "نمونه SQL انتخاب‌شده پیدا نشد: $wantedSqlService" }
} elseif ($sqlServices.Count -gt 1) {
  Add-Result 'SQL Server Database Engine' 'WARN' ('چند نمونه SQL نصب است؛ هنگام نصب -SqlInstance را مشخص کنید: ' + (($sqlServices | ForEach-Object {$_.Name}) -join ', '))
} elseif ($sqlServices.Count -eq 1 -and $sqlServices[0].Status -eq 'Running') {
  Add-Result 'SQL Server Database Engine' 'PASS' $sqlServices[0].Name
} elseif ($sqlServices.Count -eq 1) {
  Add-Result 'SQL Server Database Engine' 'WARN' 'سرویس SQL نصب است ولی متوقف است؛ نصب‌کننده تلاش می‌کند آن را راه‌اندازی کند.'
} elseif ($SqlExpressInstaller -and (Test-Path -LiteralPath $SqlExpressInstaller -PathType Leaf) -and [IO.Path]::GetFileName($SqlExpressInstaller) -ieq 'setup.exe') {
  Add-Result 'SQL Server Database Engine' 'PASS' "رسانه کامل Setup برای نصب SQL Express موجود است: $SqlExpressInstaller"
} else { Add-Result 'SQL Server Database Engine' 'FAIL' 'SQL Server پیدا نشد؛ SQL Server را نصب کنید یا مسیر setup.exe رسانه کامل SQL Express را با -SqlExpressInstaller بدهید.' }
try {
  $drive = Get-PSDrive -Name ($env:SystemDrive.TrimEnd(':')) -ErrorAction Stop; $freeGB = [math]::Round($drive.Free / 1GB, 1)
  if ($freeGB -ge 10) { Add-Result 'Free disk space' 'PASS' "$freeGB GB free on $($env:SystemDrive)" } else { Add-Result 'Free disk space' 'FAIL' "فقط $freeGB GB فضای خالی وجود دارد؛ حداقل 10 GB لازم است؛ فضای داده و پشتیبان جداگانه لازم است." }
} catch { Add-Result 'Free disk space' 'WARN' 'فضای خالی دیسک قابل محاسبه نبود.' }
$csc = @("$env:WINDIR\Microsoft.NET\Framework64\v4.0.30319\csc.exe", "$env:WINDIR\Microsoft.NET\Framework\v4.0.30319\csc.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1
if ($csc) { Add-Result '.NET Framework compiler' 'PASS' $csc } else { Add-Result '.NET Framework compiler' 'FAIL' 'برای ساخت میزبان Windows Service، کامپایلر .NET Framework csc.exe لازم است.' }
try {
  $listener = Get-NetTCPConnection -State Listen -LocalPort $HttpsPort -ErrorAction SilentlyContinue
  if ($listener) { Add-Result "HTTPS port $HttpsPort" 'FAIL' "پورت $HttpsPort در حال استفاده است؛ قبل از نصب سرویس فعلی را شناسایی کنید." } else { Add-Result "HTTPS port $HttpsPort" 'PASS' "پورت $HttpsPort آزاد است." }
} catch { Add-Result "HTTPS port $HttpsPort" 'WARN' 'وضعیت پورت قابل بررسی نبود.' }
$failed = @($script:Results | Where-Object Status -eq 'FAIL').Count; $warned = @($script:Results | Where-Object Status -eq 'WARN').Count
Write-Host ''; Write-Host ("نتیجه: {0} خطا، {1} هشدار، {2} بررسی" -f $failed,$warned,$script:Results.Count) -ForegroundColor Cyan
if ($failed -gt 0) { Write-Host 'PRECHECK FAILED. نصب را شروع نکنید.' -ForegroundColor Red; exit 2 }
Write-Host 'PRECHECK PASSED. این نتیجه فقط پیش‌نیازها را تأیید می‌کند، نه نصب و عملکرد SQL/API را.' -ForegroundColor Yellow; exit 0
