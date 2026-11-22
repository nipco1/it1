[CmdletBinding(SupportsShouldProcess=$true,ConfirmImpact='High')]
param(
  [Parameter(Mandatory=$true)][string]$BackupFile,
  [string]$AppRoot = 'C:\NIPCO\Control',
  [string]$ServiceName = 'NIPCOControl'
)
$ErrorActionPreference = 'Stop'
$logDir = Join-Path $AppRoot 'logs'; New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$logFile = Join-Path $logDir 'restore.log'
function Write-RestoreLog([string]$Message) { Add-Content -LiteralPath $logFile -Value ("{0} {1}" -f (Get-Date -Format o),$Message) }
$cfgPath = Join-Path $AppRoot '.env'
if (-not (Test-Path -LiteralPath $cfgPath)) { throw 'فایل تنظیمات نصب پیدا نشد.' }
$backupRoot = [IO.Path]::GetFullPath((Join-Path $AppRoot 'Backups'))
$file = [IO.Path]::GetFullPath($BackupFile)
if (-not $file.StartsWith(($backupRoot.TrimEnd('\')+'\'),[StringComparison]::OrdinalIgnoreCase) -or -not (Test-Path -LiteralPath $file -PathType Leaf)) { throw 'فایل پشتیبان باید در پوشه Backups همین برنامه قرار داشته باشد.' }
$cfg = @{}
foreach ($line in Get-Content -LiteralPath $cfgPath) { if ($line -match '^\s*([^#=\s]+)\s*=\s*(.*)\s*$') { $cfg[$Matches[1]] = $Matches[2].Trim().Trim('"').Trim("'") } }
$builder = New-Object System.Data.SqlClient.SqlConnectionStringBuilder
$hostName=[string]$cfg['SQL_HOST']; $port=1433; if ($cfg['SQL_PORT']) { $port=[int]$cfg['SQL_PORT'] }
$builder['Data Source']=if ($hostName.Contains(',')) { $hostName } else { "$hostName,$port" }; $builder['Initial Catalog']='master'; $builder['Integrated Security']=$true; $builder['Encrypt']=$true; $builder['TrustServerCertificate']=($cfg['SQL_TRUST_CERT'] -eq 'true'); $builder['Connect Timeout']=20
$db = [string]$cfg['SQL_DATABASE']; if ($db -notmatch '^[A-Za-z0-9_]{1,128}$') { throw 'نام دیتابیس نامعتبر است.' }
if (-not $PSCmdlet.ShouldProcess($db, "Restore from $file (the current database will be replaced)")) { return }
$svc = Get-Service -Name $ServiceName -ErrorAction Stop
$stoppedByScript = $false; $restoreStarted = $false; $restoreCompleted = $false; $cn=$null
try {
  if ($svc.Status -ne 'Stopped') { Stop-Service -Name $ServiceName -Force; $svc.WaitForStatus('Stopped',[TimeSpan]::FromSeconds(60)); $stoppedByScript=$true }
  $cn = New-Object System.Data.SqlClient.SqlConnection($builder.ConnectionString); $cn.Open()
  $dbSql='['+$db.Replace(']',']]')+']'; $fileSql="N'"+$file.Replace("'","''")+"'"
  $cmd=$cn.CreateCommand(); $cmd.CommandTimeout=0
  $cmd.CommandText="RESTORE VERIFYONLY FROM DISK=$fileSql WITH CHECKSUM;"; [void]$cmd.ExecuteNonQuery()
  Write-RestoreLog "VERIFYONLY passed: $file"
  $cmd.CommandText="ALTER DATABASE $dbSql SET SINGLE_USER WITH ROLLBACK IMMEDIATE;"; [void]$cmd.ExecuteNonQuery()
  $restoreStarted=$true
  $cmd.CommandText="RESTORE DATABASE $dbSql FROM DISK=$fileSql WITH REPLACE, CHECKSUM, RECOVERY;"; [void]$cmd.ExecuteNonQuery()
  $cmd.CommandText="ALTER DATABASE $dbSql SET MULTI_USER;"; [void]$cmd.ExecuteNonQuery()
  # Re-link application SQL user to the server login when restoring on another server/VM (fixes orphaned SID).
  $cmd.CommandText="USE $dbSql; IF EXISTS (SELECT 1 FROM sys.database_principals WHERE name=N'nipco_app') AND EXISTS (SELECT 1 FROM sys.server_principals WHERE name=N'nipco_app') ALTER USER [nipco_app] WITH LOGIN = [nipco_app]; USE [master];"; [void]$cmd.ExecuteNonQuery()
  $cmd.CommandText="DBCC CHECKDB ($dbSql) WITH NO_INFOMSGS;"
  $reader=$cmd.ExecuteReader()
  if ($reader.HasRows) {
    $messages=@(); while ($reader.Read()) { if ($reader.FieldCount -gt 3) { $messages += [string]$reader.GetValue(3) } }
    $reader.Close()
    throw ("DBCC CHECKDB reported consistency errors: " + ($messages -join ' | '))
  }
  $reader.Close()
  $restoredFileName=[IO.Path]::GetFileName($file)
  $restoredFileSize=(Get-Item -LiteralPath $file).Length
  $history=$cn.CreateCommand(); $history.CommandTimeout=30
  $history.CommandText="IF EXISTS (SELECT 1 FROM $dbSql.control.BackupHistory WHERE file_name=@file) UPDATE $dbSql.control.BackupHistory SET verified=1,file_size=@size WHERE file_name=@file; ELSE INSERT INTO $dbSql.control.BackupHistory(file_name,file_size,backup_type,verified) VALUES(@file,@size,'FULL',1);"
  [void]$history.Parameters.Add('@file',[System.Data.SqlDbType]::NVarChar,260)
  [void]$history.Parameters.Add('@size',[System.Data.SqlDbType]::BigInt)
  $history.Parameters['@file'].Value=$restoredFileName; $history.Parameters['@size'].Value=[long]$restoredFileSize
  [void]$history.ExecuteNonQuery()
  $restoreCompleted=$true
  Write-RestoreLog "RESTORE, DBCC CHECKDB and BackupHistory verification completed: $file"
} catch {
  Write-RestoreLog ("ERROR {0}" -f $_.Exception.Message)
  if ($restoreStarted -and $cn -and $cn.State -eq 'Open') { try { $fix=$cn.CreateCommand(); $fix.CommandText="ALTER DATABASE [$($db.Replace(']',']]'))] SET MULTI_USER;"; [void]$fix.ExecuteNonQuery() } catch { Write-RestoreLog ("Could not set MULTI_USER: {0}" -f $_.Exception.Message) } }
  throw
} finally {
  if ($cn) { if ($cn.State -eq 'Open') { $cn.Close() }; $cn.Dispose() }
  if ($stoppedByScript -and ($restoreCompleted -or -not $restoreStarted)) {
    try { Start-Service -Name $ServiceName; (Get-Service -Name $ServiceName).WaitForStatus('Running',[TimeSpan]::FromSeconds(60)); Write-RestoreLog 'Application service started.' }
    catch { Write-RestoreLog ("SERVICE START ERROR {0}" -f $_.Exception.Message) }
  }
}
if (-not $restoreCompleted) { throw 'بازیابی کامل نشد؛ سرویس برای ایمنی ممکن است متوقف مانده باشد. فایل logs\restore.log را بررسی کنید.' }
Write-Output 'RESTORE_OK; RESTORE VERIFYONLY and DBCC CHECKDB completed.'
