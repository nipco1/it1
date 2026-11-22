[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)][string]$CertificateFile,
  [Parameter(Mandatory=$true)][string]$ExpectedDnsName
)
$ErrorActionPreference='Stop'
if (-not (Test-Path -LiteralPath $CertificateFile -PathType Leaf)) { throw "Certificate file not found: $CertificateFile" }
if ($ExpectedDnsName -notmatch '^(?=.{1,253}$)[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*$') { throw 'ExpectedDnsName نام DNS معتبر نیست.' }
$cert = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2($CertificateFile)
if ($cert.HasPrivateKey) { throw 'فایل گواهی نباید کلید خصوصی داشته باشد؛ گواهی صادرشده از سرور را دوباره بررسی کنید.' }
if ($cert.NotBefore -gt (Get-Date) -or $cert.NotAfter -le (Get-Date)) { throw 'گواهی هنوز معتبر نشده یا منقضی است.' }
if ($cert.Subject -cne $cert.Issuer) { throw 'گواهی خودامضای مورد انتظار نیست؛ نصب خودکار متوقف شد.' }
$san = @($cert.Extensions | Where-Object { $_.Oid.Value -eq '2.5.29.17' } | ForEach-Object { $_.Format($false) }) -join ';'
if ($san -notmatch ( '(?i)(?:^|[;,]\s*)DNS Name=' + [regex]::Escape($ExpectedDnsName) + '(?:[;,]|$)' )) {
  throw "نام DNS گواهی با مقصد مورد انتظار مطابقت ندارد: $ExpectedDnsName"
}
$thumb = $cert.Thumbprint
if ($thumb -notmatch '^[A-Fa-f0-9]{40,64}$') { throw 'اثر انگشت گواهی معتبر نیست.' }
$existing = Get-ChildItem Cert:\LocalMachine\Root | Where-Object Thumbprint -eq $thumb
if (-not $existing) {
  Import-Certificate -FilePath $CertificateFile -CertStoreLocation 'Cert:\LocalMachine\Root' | Out-Null
}
Write-Host "گواهی معتبر با DNS=$ExpectedDnsName و Thumbprint=$thumb در Trusted Root نصب شد." -ForegroundColor Green
Write-Host 'برای حذف بعدی، فقط گواهی همین اثر انگشت را از Trusted Root حذف کنید.' -ForegroundColor Yellow
