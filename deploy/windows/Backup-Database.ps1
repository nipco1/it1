[CmdletBinding()]
param([string]$AppRoot = 'C:\NIPCO\Control', [ValidateRange(7,3650)][int]$RetentionDays = 30)
$ErrorActionPreference = 'Stop'
$envFile = Join-Path $AppRoot '.env'
$backupDir = Join-Path $AppRoot 'Backups'
$logDir = Join-Path $AppRoot 'logs'
New-Item -ItemType Directory -Force -Path $backupDir,$logDir | Out-Null
$log = Join-Path $logDir 'backup.log'
function Write-BackupLog([string]$Message) { Add-Content -LiteralPath $log -Value ("{0} {1}" -f (Get-Date -Format o),$Message) }
function Read-EnvFile([string]$path) {
  $items = @{}
  foreach ($line in Get-Content -LiteralPath $path -ErrorAction Stop) {
    if ($line -match '^\s*([^#=\s]+)\s*=\s*(.*)\s*$') { $items[$Matches[1]] = $Matches[2].Trim().Trim('"').Trim("'") }
  }
  return $items
}
$cn = $null
try {
  $cfg = Read-EnvFile $envFile
  foreach ($key in @('SQL_HOST','SQL_DATABASE','SQL_USER','SQL_PASSWORD')) { if (-not $cfg[$key]) { throw "Missing $key in .env" } }
  $db = [string]$cfg['SQL_DATABASE']
  if ($db -notmatch '^[A-Za-z0-9_]{1,128}$') { throw 'Unsafe database name in .env' }
  $builder = New-Object System.Data.SqlClient.SqlConnectionStringBuilder
  $hostName = [string]$cfg['SQL_HOST']; $port = 1433; if ($cfg['SQL_PORT']) { $port = [int]$cfg['SQL_PORT'] }
  $builder['Data Source'] = if ($hostName.Contains(',')) { $hostName } else { "$hostName,$port" }
  $builder['Initial Catalog'] = 'master'; $builder['User ID'] = $cfg['SQL_USER']; $builder['Password'] = $cfg['SQL_PASSWORD']
  $builder['Encrypt'] = $true; $builder['TrustServerCertificate'] = ($cfg['SQL_TRUST_CERT'] -eq 'true'); $builder['Connect Timeout'] = 20
  $cn = New-Object System.Data.SqlClient.SqlConnection($builder.ConnectionString); $cn.Open()
  $fileName = $db + '_' + (Get-Date -Format 'yyyyMMdd_HHmmss') + '.bak'
  $file = Join-Path $backupDir $fileName
  $dbSql = '[' + $db.Replace(']', ']]') + ']'; $pathSql = "N'" + $file.Replace("'", "''") + "'"; $fileSql = "N'" + $fileName.Replace("'", "''") + "'"
  $cmd = $cn.CreateCommand(); $cmd.CommandTimeout = 0
  $cmd.CommandText = "BACKUP DATABASE $dbSql TO DISK=$pathSql WITH INIT, CHECKSUM;"
  [void]$cmd.ExecuteNonQuery()
  if (-not (Test-Path -LiteralPath $file -PathType Leaf) -or (Get-Item -LiteralPath $file).Length -le 0) { throw 'SQL Server did not create a non-empty backup file.' }
  $size = (Get-Item -LiteralPath $file).Length
  $insert = $cn.CreateCommand(); $insert.CommandTimeout = 30
  $insert.CommandText = "INSERT INTO $dbSql.control.BackupHistory(file_name,file_size,backup_type,verified) VALUES($fileSql,$size,'FULL',0);"
  [void]$insert.ExecuteNonQuery()
  Write-BackupLog ("SUCCESS {0} {1} bytes; CHECKSUM enabled; restore not yet tested" -f $file,$size)
  # Keep the newest backup regardless of age, and prune only older files matching this database.
  $cutoff=(Get-Date).AddDays(-$RetentionDays)
  $matching=@(Get-ChildItem -LiteralPath $backupDir -Filter ($db + '_*.bak') -File | Sort-Object LastWriteTime -Descending)
  foreach ($old in $matching | Select-Object -Skip 1) {
    if ($old.LastWriteTime -lt $cutoff) {
      Remove-Item -LiteralPath $old.FullName -Force
      $deleteHistory = $cn.CreateCommand(); $deleteHistory.CommandTimeout = 30
      $deleteHistory.CommandText = "DELETE FROM $dbSql.control.BackupHistory WHERE file_name=@file"
      [void]$deleteHistory.Parameters.Add('@file',[System.Data.SqlDbType]::NVarChar,260)
      $deleteHistory.Parameters['@file'].Value = $old.Name
      [void]$deleteHistory.ExecuteNonQuery()
      Write-BackupLog ("RETENTION deleted {0}" -f $old.FullName)
    }
  }
  Write-Output "BACKUP_CREATED=$file"
  Write-Output 'RESTORE_TESTED=False'
} catch {
  Write-BackupLog ("ERROR {0}" -f $_.Exception.Message)
  throw
} finally { if ($cn -and $cn.State -eq 'Open') { $cn.Close() }; if ($cn) { $cn.Dispose() } }
