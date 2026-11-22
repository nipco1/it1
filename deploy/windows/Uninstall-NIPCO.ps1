[CmdletBinding(SupportsShouldProcess=$true,ConfirmImpact='High')]
param(
  [string]$TargetRoot='C:\NIPCO\Control',
  [switch]$RemoveBackups,
  [switch]$RemoveLogs
)
$ErrorActionPreference='Stop'
$id=[Security.Principal.WindowsIdentity]::GetCurrent(); $principal=New-Object Security.Principal.WindowsPrincipal($id)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'PowerShell را با Run as administrator اجرا کنید.' }
$thumbFile=Join-Path $TargetRoot 'certificates\NIPCO-Control.thumbprint.txt'
if (Test-Path -LiteralPath $thumbFile) {
  $thumb=(Get-Content -LiteralPath $thumbFile -Raw).Trim()
  if ($thumb -match '^[A-Fa-f0-9]{40,64}$') {
    foreach ($store in @('Cert:\LocalMachine\My','Cert:\LocalMachine\Root')) {
      $certPath=Join-Path $store $thumb
      if ((Test-Path -LiteralPath $certPath) -and $PSCmdlet.ShouldProcess($certPath,'Remove NIPCO server certificate')) { Remove-Item -LiteralPath $certPath -Force -ErrorAction SilentlyContinue }
    }
  }
}
$svc=Get-Service -Name NIPCOControl -ErrorAction SilentlyContinue
if ($svc) {
  if ($svc.Status -ne 'Stopped') { Stop-Service NIPCOControl -Force; $svc.WaitForStatus('Stopped',[TimeSpan]::FromSeconds(60)) }
  if ($PSCmdlet.ShouldProcess('NIPCOControl','Delete Windows service')) { sc.exe delete NIPCOControl | Out-Null }
}
if ($PSCmdlet.ShouldProcess('NIPCO Control Daily SQL Backup','Unregister scheduled task')) {
  Unregister-ScheduledTask -TaskName 'NIPCO Control Daily SQL Backup' -Confirm:$false -ErrorAction SilentlyContinue
}
if ($PSCmdlet.ShouldProcess('NIPCO Control HTTPS 8443','Remove firewall rule')) {
  Remove-NetFirewallRule -DisplayName 'NIPCO Control HTTPS 8443' -ErrorAction SilentlyContinue
}
[Environment]::SetEnvironmentVariable('NIPCO_APP_ROOT',$null,'Machine')
[Environment]::SetEnvironmentVariable('NIPCO_NODE_PATH',$null,'Machine')
if (Test-Path -LiteralPath $TargetRoot) {
  $preserve=@('Backups','logs','certificates')
  if ($RemoveBackups) { $preserve=$preserve | Where-Object { $_ -ne 'Backups' } }
  if ($RemoveLogs) { $preserve=$preserve | Where-Object { $_ -ne 'logs' } }
  foreach ($item in Get-ChildItem -LiteralPath $TargetRoot -Force) {
    if ($preserve -notcontains $item.Name) {
      if ($PSCmdlet.ShouldProcess($item.FullName,'Remove application file')) { Remove-Item -LiteralPath $item.FullName -Recurse -Force }
    }
  }
  foreach ($name in @('Backups','logs')) {
    if (($name -eq 'Backups' -and $RemoveBackups) -or ($name -eq 'logs' -and $RemoveLogs)) {
      $path=Join-Path $TargetRoot $name
      if (Test-Path $path -and $PSCmdlet.ShouldProcess($path,'Remove preserved local files')) { Remove-Item -LiteralPath $path -Recurse -Force }
    }
  }
}
Write-Warning 'پایگاه داده SQL و حساب nipco_app عمداً حذف نمی‌شوند. فایل Backups و logs به‌صورت پیش‌فرض حفظ شده‌اند.'
Write-Warning 'گواهی ریشه‌ای که روی رایانه‌های کلاینت نصب شده است باید در صورت نیاز جداگانه از Trusted Root آن رایانه‌ها حذف شود.'
