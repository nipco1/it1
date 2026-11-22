[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$BackupFile, [string]$AppRoot='C:\NIPCO\Control')
$ErrorActionPreference='Stop'
$backupRoot=[IO.Path]::GetFullPath((Join-Path $AppRoot 'Backups'))
$file=[IO.Path]::GetFullPath($BackupFile)
if (-not $file.StartsWith(($backupRoot.TrimEnd('\')+'\'),[StringComparison]::OrdinalIgnoreCase)) { throw 'فایل باید در پوشه Backups برنامه باشد.' }
if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { throw 'فایل پشتیبان پیدا نشد.' }
$cfgPath=Join-Path $AppRoot '.env'
if (-not (Test-Path -LiteralPath $cfgPath)) { throw 'فایل .env نصب موجود نیست.' }
$cfg=@{}
foreach ($line in Get-Content -LiteralPath $cfgPath) { if ($line -match '^\s*([^#=\s]+)\s*=\s*(.*)\s*$') { $cfg[$Matches[1]]=$Matches[2].Trim().Trim('"').Trim("'") } }
$hostName=[string]$cfg['SQL_HOST']; $port=1433; if ($cfg['SQL_PORT']) { $port=[int]$cfg['SQL_PORT'] }
$builder=New-Object System.Data.SqlClient.SqlConnectionStringBuilder
$builder.DataSource=if ($hostName.Contains(',')) { $hostName } else { "$hostName,$port" }
$builder.InitialCatalog='master'; $builder.IntegratedSecurity=$true; $builder.Encrypt=$true; $builder.TrustServerCertificate=($cfg['SQL_TRUST_CERT'] -eq 'true'); $builder.ConnectTimeout=20
$connection=New-Object System.Data.SqlClient.SqlConnection($builder.ConnectionString)
try {
  $connection.Open()
  $command=$connection.CreateCommand(); $command.CommandTimeout=0
  $quotedPath="N'"+$file.Replace("'","''")+"'"
  $command.CommandText="RESTORE VERIFYONLY FROM DISK=$quotedPath WITH CHECKSUM;"
  [void]$command.ExecuteNonQuery()
  Write-Host 'BACKUP VERIFYONLY PASSED. This verifies backup readability/checksum only; it is not a full restore test.' -ForegroundColor Green
  Write-Output "BACKUP_VERIFIED=$file"
} finally { if ($connection.State -eq 'Open') { $connection.Close() }; $connection.Dispose() }
