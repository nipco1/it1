[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$BaseUrl)
$ErrorActionPreference = 'Stop'
$Origin = $BaseUrl.TrimEnd('/')
if ($Origin -notmatch '^https://[^/]+$') { throw 'BaseUrl باید فقط مبدأ HTTPS باشد؛ مانند https://nipco-srv.company.local:8443' }
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

function Convert-SecureStringToPlain([Security.SecureString]$Value) {
  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Value)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
}
function Invoke-Api([string]$Path, [string]$Method, $Session, $Body = $null) {
  $parameters = @{ Uri=($Origin + $Path); Method=$Method; WebSession=$Session; TimeoutSec=40; UseBasicParsing=$true }
  if ($Method -notin @('GET','HEAD')) { $parameters.Headers = @{ Origin=$Origin } }
  if ($null -ne $Body) { $parameters.ContentType='application/json; charset=utf-8'; $parameters.Body=($Body | ConvertTo-Json -Depth 100 -Compress) }
  return Invoke-RestMethod @parameters
}
function Login([string]$Username, [Security.SecureString]$Password) {
  $plain = Convert-SecureStringToPlain $Password
  $session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
  try { [void](Invoke-Api '/api/auth/login' 'POST' $session @{ username=$Username; password=$plain }) }
  finally { $plain = $null }
  return $session
}
function Clone-Json($Object) { return (ConvertFrom-Json -InputObject (ConvertTo-Json -InputObject $Object -Depth 100 -Compress)) }

Write-Host 'NIPCO Control - آزمون واقعی اشتراک داده بین دو حساب و دو نشست HTTPS' -ForegroundColor Cyan
Write-Host 'این آزمون مقدار Footer را موقتاً تغییر می‌دهد و در پایان به مقدار قبلی برمی‌گرداند.' -ForegroundColor Yellow
$adminUser = (Read-Host 'نام کاربری مدیر سیستم').Trim()
$adminPassword = Read-Host 'رمز مدیر سیستم' -AsSecureString
$secondUser = (Read-Host 'نام کاربری حساب دوم فعال (غیر از مدیر اول)').Trim()
$secondPassword = Read-Host 'رمز حساب دوم' -AsSecureString
if (-not $adminUser -or -not $secondUser -or $adminUser -ieq $secondUser) { throw 'برای آزمون، دو حساب فعال و متفاوت وارد کنید.' }

$adminSession = $null; $secondSession = $null; $initialFooter = $null; $probeFooter = $null; $writeCompleted = $false; $restoreSucceeded = $false
try {
  $health = Invoke-RestMethod -Uri ($Origin + '/api/health') -Method Get -TimeoutSec 20
  if ($health.ok -ne $true -or $health.database -ne 'connected') { throw 'Health API اتصال SQL Server را تأیید نکرد.' }
  Write-Host '[PASS] API و اتصال SQL Server' -ForegroundColor Green

  $adminSession = Login $adminUser $adminPassword
  Write-Host '[PASS] ورود مدیر با نشست مستقل' -ForegroundColor Green
  $secondSession = Login $secondUser $secondPassword
  Write-Host '[PASS] ورود حساب دوم با نشست مستقل' -ForegroundColor Green

  $initial = Invoke-Api '/api/state' 'GET' $adminSession
  $secondInitial = Invoke-Api '/api/state' 'GET' $secondSession
  if (-not $initial.state -or -not $initial.state.branding) { throw 'پایگاه برنامه هنوز مقداردهی اولیه نشده است.' }
  if ($initial.state.PSObject.Properties.Name -contains 'users' -or $secondInitial.state.PSObject.Properties.Name -contains 'users') { throw 'حساب‌ها هنوز به سند JSON عملیاتی نشت می‌کنند؛ آزمون متوقف شد.' }
  if ([long]$secondInitial.revision -ne [long]$initial.revision) { throw 'پایگاه در حین آماده‌سازی آزمون تغییر کرده است؛ اجرا را تکرار کنید.' }
  $initialFooter = [string]$initial.state.branding.footer
  $probeFooter = 'NIPCO-MULTIUSER-VERIFY-' + [Guid]::NewGuid().ToString('N')
  $writeState = Clone-Json $initial.state
  $writeState.branding.footer = $probeFooter
  $writeState | Add-Member -NotePropertyName users -NotePropertyValue @($initial.users) -Force
  $null = Invoke-Api '/api/state' 'PUT' $adminSession @{ revision=[long]$initial.revision; state=$writeState }
  $writeCompleted = $true
  Write-Host '[PASS] مدیر یک تغییر موقت را در SQL ثبت کرد' -ForegroundColor Green

  # A second client attempts to submit its old snapshot. The server must reject it
  # with HTTP 409 rather than silently overwrite the administrator's newer change.
  $staleState = Clone-Json $secondInitial.state
  $staleState.branding.footer = 'NIPCO-STALE-WRITE-MUST-BE-REJECTED'
  $staleState | Add-Member -NotePropertyName users -NotePropertyValue @($secondInitial.users) -Force
  $staleStatus = 0
  try { $null = Invoke-Api '/api/state' 'PUT' $secondSession @{ revision=[long]$secondInitial.revision; state=$staleState }; $staleStatus = 200 }
  catch {
    if ($_.Exception.Response) { $staleStatus = [int]$_.Exception.Response.StatusCode }
    else { throw }
  }
  if ($staleStatus -ne 409) { throw "ذخیره Snapshot قدیمی باید با HTTP 409 رد می‌شد؛ پاسخ دریافت‌شده: $staleStatus" }
  Write-Host '[PASS] ارسال Snapshot قدیمی توسط کلاینت دوم با HTTP 409 رد شد' -ForegroundColor Green

  $secondRead = Invoke-Api '/api/state' 'GET' $secondSession
  if ([string]$secondRead.state.branding.footer -cne $probeFooter) { throw 'حساب دوم تغییر ثبت‌شده توسط مدیر را از همان پایگاه مرکزی مشاهده نکرد؛ یا Snapshot قدیمی آن را بازنویسی کرد.' }
  Write-Host '[PASS] حساب دوم تغییر مدیر را از پایگاه مرکزی مشاهده کرد' -ForegroundColor Green

  $adminRead = Invoke-Api '/api/state' 'GET' $adminSession
  $revisionCheck = Invoke-Api '/api/state/revision' 'GET' $secondSession
  if ([long]$revisionCheck.revision -ne [long]$adminRead.revision) { throw 'Revision دو نشست با نسخه مرکزی یکسان نیست.' }
  Write-Host '[PASS] هر دو نشست Revision واحد پایگاه را مشاهده کردند' -ForegroundColor Green
}
finally {
  if ($writeCompleted -and $adminSession) {
    try {
      $latest = Invoke-Api '/api/state' 'GET' $adminSession
      # Do not overwrite another administrator's edit if the test value has changed.
      if ([string]$latest.state.branding.footer -ceq $probeFooter) {
        $restoreState = Clone-Json $latest.state
        $restoreState.branding.footer = $initialFooter
        $restoreState | Add-Member -NotePropertyName users -NotePropertyValue @($latest.users) -Force
        $null = Invoke-Api '/api/state' 'PUT' $adminSession @{ revision=[long]$latest.revision; state=$restoreState }
        $restoreSucceeded = $true
        Write-Host '[PASS] مقدار موقت بدون حذف تغییرات دیگر به مقدار قبلی برگشت' -ForegroundColor Green
      } else {
        Write-Warning 'Footer در طول آزمون توسط کاربر دیگری تغییر کرده است؛ برای جلوگیری از بازنویسی تغییر او، مقدار خودکار برنگشت.'
      }
    } catch { Write-Warning ("بازگردانی Footer آزمون ناموفق بود؛ مقدار فعلی را دستی بررسی کنید. علت: " + $_.Exception.Message) }
  }
  $adminPassword = $null; $secondPassword = $null
}
if ($writeCompleted -and -not $restoreSucceeded) { throw 'آزمون اشتراک داده انجام شد، اما مقدار موقت به‌طور خودکار بازنگشت؛ پیش از استفاده، Branding/Footer را بررسی کنید.' }
Write-Host 'MULTI-USER TEST PASSED' -ForegroundColor Green
