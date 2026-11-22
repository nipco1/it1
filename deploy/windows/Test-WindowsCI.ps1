[CmdletBinding()]
param(
  [string]$TargetRoot = 'C:\NIPCO\Control',
  [int]$SqlPort = 1433
)
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path

function Write-Step([string]$Title) {
  Write-Host "`n============================================================" -ForegroundColor Cyan
  Write-Host "STEP: $Title" -ForegroundColor Cyan
  Write-Host "============================================================" -ForegroundColor Cyan
  Write-Host "::notice::STEP: $Title"
}

function Sql-Exec([string]$ConnectionString, [string]$CommandText, [int]$Timeout = 120) {
  $cn = New-Object System.Data.SqlClient.SqlConnection($ConnectionString)
  try {
    $cn.Open()
    $cmd = $cn.CreateCommand()
    $cmd.CommandText = $CommandText
    $cmd.CommandTimeout = $Timeout
    [void]$cmd.ExecuteNonQuery()
  } finally {
    if ($cn.State -eq 'Open') { $cn.Close() }
    $cn.Dispose()
  }
}

function Sql-Scalar([string]$ConnectionString, [string]$CommandText) {
  $cn = New-Object System.Data.SqlClient.SqlConnection($ConnectionString)
  try {
    $cn.Open()
    $cmd = $cn.CreateCommand()
    $cmd.CommandText = $CommandText
    return $cmd.ExecuteScalar()
  } finally {
    if ($cn.State -eq 'Open') { $cn.Close() }
    $cn.Dispose()
  }
}

function Invoke-Api([string]$Origin, [string]$Path, [string]$Method, $Session, $Body = $null) {
  $params = @{ Uri = ($Origin + $Path); Method = $Method; WebSession = $Session; TimeoutSec = 40; UseBasicParsing = $true }
  if ($Method -notin @('GET', 'HEAD')) { $params.Headers = @{ Origin = $Origin } }
  if ($null -ne $Body) {
    $params.ContentType = 'application/json; charset=utf-8'
    $params.Body = [System.Text.Encoding]::UTF8.GetBytes(($Body | ConvertTo-Json -Depth 100 -Compress))
  }
  return Invoke-RestMethod @params
}

# 1. PowerShell 5.1 syntax verification for all deployment scripts
Write-Step '1. PowerShell 5.1 syntax check across all deploy/windows/*.ps1'
$psFiles = Get-ChildItem -LiteralPath (Join-Path $RepoRoot 'deploy\windows') -Filter '*.ps1' -File
foreach ($f in $psFiles) {
  $tokens = $null; $errors = $null
  [void][System.Management.Automation.Language.Parser]::ParseFile($f.FullName, [ref]$tokens, [ref]$errors)
  if ($errors -and $errors.Count -gt 0) {
    $msg = ($errors | ForEach-Object { "$($f.Name):$($_.Extent.StartLineNumber): $($_.Message)" }) -join "`n"
    throw "PowerShell syntax errors:`n$msg"
  }
  Write-Host "[PASS] Syntax OK: $($f.Name)" -ForegroundColor Green
}

# 2. Frontend & Backend npm ci, typecheck, build, and automated tests on Windows
Write-Step '2. Node/npm build, typecheck, logic, scanner, and server tests on Windows'
Push-Location $RepoRoot
try {
  npm ci --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) { throw 'Frontend npm ci failed' }
  npm run typecheck
  if ($LASTEXITCODE -ne 0) { throw 'Frontend typecheck failed' }
  npm run build
  if ($LASTEXITCODE -ne 0) { throw 'Frontend build failed' }
  npm run test:logic
  if ($LASTEXITCODE -ne 0) { throw 'test:logic failed' }
  npm run test:scanner
  if ($LASTEXITCODE -ne 0) { throw 'test:scanner failed' }
  npm --prefix server ci --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) { throw 'Server npm ci failed' }
  npm --prefix server run check
  if ($LASTEXITCODE -ne 0) { throw 'Server syntax check failed' }
  npm --prefix server test
  if ($LASTEXITCODE -ne 0) { throw 'Server tests failed' }
} finally { Pop-Location }
Write-Host '[PASS] All Node/TypeScript/Build/Server tests passed on Windows!' -ForegroundColor Green

# 3. C# ServiceHost.cs compilation check
Write-Step '3. Compile C# Windows Service Host (ServiceHost.cs)'
$csc = @("$env:WINDIR\Microsoft.NET\Framework64\v4.0.30319\csc.exe", "$env:WINDIR\Microsoft.NET\Framework\v4.0.30319\csc.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $csc) { throw 'csc.exe not found' }
$tempExe = Join-Path $env:TEMP 'NIPCOControlService-Check.exe'
& $csc /nologo /warnaserror /target:exe /out:$tempExe /reference:System.ServiceProcess.dll (Join-Path $RepoRoot 'deploy\windows\ServiceHost.cs')
if ($LASTEXITCODE -ne 0 -or -not (Test-Path $tempExe)) { throw 'ServiceHost.cs compilation failed' }
Remove-Item -LiteralPath $tempExe -Force -ErrorAction SilentlyContinue
Write-Host '[PASS] ServiceHost.cs compiled cleanly with /warnaserror' -ForegroundColor Green

# 4. Ensure a real SQL Server Database Engine instance is installed & running
Write-Step '4. Ensure SQL Server Database Engine is installed and configured (TCP + Mixed Mode)'
$sqlServices = @(Get-Service -ErrorAction SilentlyContinue | Where-Object { $_.Name -eq 'MSSQLSERVER' -or $_.Name -like 'MSSQL$*' })
if ($sqlServices.Count -eq 0) {
  Write-Host 'No SQL Server Engine found yet; installing SQL Server Express via Chocolatey...' -ForegroundColor Yellow
  choco install sql-server-express -y --no-progress --params="/IACCEPTSQLSERVERLICENSETERMS /Q /ACTION=Install /FEATURES=SQLENGINE /INSTANCENAME=SQLEXPRESS /SECURITYMODE=SQL /SAPWD=CiSqlAdmin!2026#99 /SQLSVCSTARTUPTYPE=Automatic /TCPENABLED=1"
  if ($LASTEXITCODE -ne 0) { throw "Installing sql-server-express via choco failed (exit $LASTEXITCODE)" }
  $sqlServices = @(Get-Service -ErrorAction SilentlyContinue | Where-Object { $_.Name -eq 'MSSQLSERVER' -or $_.Name -like 'MSSQL$*' })
}
if ($sqlServices.Count -eq 0) { throw 'SQL Server Database Engine service still not found after installation.' }
$sqlService = $sqlServices[0]
$sqlInstance = if ($sqlService.Name -eq 'MSSQLSERVER') { 'MSSQLSERVER' } else { $sqlService.Name -replace '^MSSQL\$', '' }
Write-Host "Using SQL Server service: $($sqlService.Name) (instance: $sqlInstance)" -ForegroundColor Green
Set-Service -Name $sqlService.Name -StartupType Automatic
if ($sqlService.Status -ne 'Running') {
  Start-Service -Name $sqlService.Name
  (Get-Service -Name $sqlService.Name).WaitForStatus('Running', [TimeSpan]::FromSeconds(120))
}

# Configure Mixed Mode + static TCP port so Install-NIPCO and sqlcmd/SqlClient connect cleanly
$instancesPath = 'HKLM:\SOFTWARE\Microsoft\Microsoft SQL Server\Instance Names\SQL'
$instanceId = (Get-ItemProperty $instancesPath).$sqlInstance
if (-not $instanceId) { throw "Could not find SQL registry instance ID for $sqlInstance" }
$instanceRoot = "HKLM:\SOFTWARE\Microsoft\Microsoft SQL Server\$instanceId"
New-ItemProperty -Path (Join-Path $instanceRoot 'MSSQLServer') -Name LoginMode -Value 2 -PropertyType DWord -Force | Out-Null
$tcpRoot = Join-Path $instanceRoot 'MSSQLServer\SuperSocketNetLib\Tcp'
Set-ItemProperty -Path $tcpRoot -Name Enabled -Value 1
$ipAll = Join-Path $tcpRoot 'IPAll'
Set-ItemProperty -Path $ipAll -Name TcpDynamicPorts -Value ''
Set-ItemProperty -Path $ipAll -Name TcpPort -Value ([string]$SqlPort)
Restart-Service -Name $sqlService.Name -Force
(Get-Service -Name $sqlService.Name).WaitForStatus('Running', [TimeSpan]::FromSeconds(120))

# 5. Run Test-Readiness.ps1 preflight on Windows Server
Write-Step '5. Run Test-Readiness.ps1 (Mode: Server)'
& (Join-Path $RepoRoot 'deploy\windows\Test-Readiness.ps1') -Mode Server -SqlInstance $sqlInstance
if ($LASTEXITCODE -ne 0) { throw "Test-Readiness.ps1 failed with exit code $LASTEXITCODE" }
Write-Host '[PASS] Test-Readiness.ps1 passed' -ForegroundColor Green

# 6. Fresh-database SQL migration verification (001 -> 003 -> 004 -> 005)
Write-Step '6. Verify all 4 SQL migrations on a 100% fresh empty SQL Server database'
$masterBuilder = New-Object System.Data.SqlClient.SqlConnectionStringBuilder
$masterBuilder['Data Source'] = "localhost,$SqlPort"
$masterBuilder['Initial Catalog'] = 'master'
$masterBuilder['Integrated Security'] = $true
$masterBuilder['Encrypt'] = $true
$masterBuilder['TrustServerCertificate'] = $true
$masterBuilder['Connect Timeout'] = 30
$masterCs = $masterBuilder.ConnectionString

$migDb = 'NIPCO_MigVerify'
Sql-Exec $masterCs "IF DB_ID(N'$migDb') IS NOT NULL BEGIN ALTER DATABASE [$migDb] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [$migDb]; END; CREATE DATABASE [$migDb];"
Sql-Exec $masterCs "IF NOT EXISTS (SELECT 1 FROM sys.sql_logins WHERE name=N'nipco_app') CREATE LOGIN [nipco_app] WITH PASSWORD=N'TempCiLoginPass!2026#99', CHECK_POLICY=ON, CHECK_EXPIRATION=OFF;"
$migBuilder = New-Object System.Data.SqlClient.SqlConnectionStringBuilder($masterCs)
$migBuilder['Initial Catalog'] = $migDb
$migCs = $migBuilder.ConnectionString
Sql-Exec $migCs "IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name=N'nipco_app') CREATE USER [nipco_app] FOR LOGIN [nipco_app];"
foreach ($mig in @('001_auth.sql', '003_app_state_and_users.sql', '004_remove_embedded_user_credentials.sql', '005_runtime_least_privilege.sql')) {
  $sqlText = Get-Content -LiteralPath (Join-Path $RepoRoot "server\sql\$mig") -Raw
  Sql-Exec $migCs $sqlText
  Write-Host "[PASS] Fresh SQL migration succeeded: $mig" -ForegroundColor Green
}
Sql-Exec $masterCs "ALTER DATABASE [$migDb] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [$migDb];"

# 7. Prepare non-interactive admin seed so Install-NIPCO.ps1 runs end-to-end without TTY prompt
Write-Step '7. Run real Install-NIPCO.ps1 (Mode: Server, TLS, Windows Service, Firewall, Backup Task)'
$prodDb = 'NIPCO_Control_CI'
Sql-Exec $masterCs "IF DB_ID(N'$prodDb') IS NOT NULL BEGIN ALTER DATABASE [$prodDb] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [$prodDb]; END; CREATE DATABASE [$prodDb];"
$prodBuilder = New-Object System.Data.SqlClient.SqlConnectionStringBuilder($masterCs)
$prodBuilder['Initial Catalog'] = $prodDb
$prodCs = $prodBuilder.ConnectionString
Sql-Exec $prodCs (Get-Content -LiteralPath (Join-Path $RepoRoot 'server\sql\001_auth.sql') -Raw)
Sql-Exec $prodCs (Get-Content -LiteralPath (Join-Path $RepoRoot 'server\sql\003_app_state_and_users.sql') -Raw)

$adminPass = 'AdminWinCI-2026-Strong!'
Push-Location (Join-Path $RepoRoot 'server')
try {
  $adminHash = (& node.exe --input-type=module -e "import argon2 from 'argon2'; console.log(await argon2.hash(process.argv[1], { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 }));" $adminPass).Trim()
} finally { Pop-Location }
if ($LASTEXITCODE -ne 0 -or -not $adminHash.StartsWith('$argon2id$')) { throw 'Failed to generate Argon2id hash for CI admin' }
$adminId = 'd0f8825b-77a5-4c84-9a0a-e2da82b2bb0b'
$escapedHash = $adminHash.Replace("'", "''")
Sql-Exec $prodCs "INSERT INTO control.Users(id,username,display_name,role,password_hash,active,group_ids) VALUES('$adminId',N'admin',N'CI Admin','admin',N'$escapedHash',1,N'""all""');"

$publicHost = $env:COMPUTERNAME
& (Join-Path $RepoRoot 'deploy\windows\Install-NIPCO.ps1') -Mode Server -TargetRoot $TargetRoot -SqlInstance $sqlInstance -SqlPort $SqlPort -Database $prodDb -PublicHost $publicHost -UseExistingDatabase
if ($LASTEXITCODE -ne 0) { throw "Install-NIPCO.ps1 failed with exit code $LASTEXITCODE" }
Write-Host '[PASS] Install-NIPCO.ps1 completed cleanly!' -ForegroundColor Green

$origin = "https://$($publicHost):8443"

# 8. Post-install verification + Client certificate SAN verification
Write-Step '8. Verify-Installation.ps1 & Install-ClientCertificate.ps1'
& (Join-Path $RepoRoot 'deploy\windows\Verify-Installation.ps1') -Mode Server -BaseUrl $origin -TargetRoot $TargetRoot
if ($LASTEXITCODE -ne 0) { throw "Verify-Installation.ps1 failed with exit code $LASTEXITCODE" }
& (Join-Path $RepoRoot 'deploy\windows\Install-ClientCertificate.ps1') -CertificateFile (Join-Path $TargetRoot 'certificates\NIPCO-Control.cer') -ExpectedDnsName $publicHost
Write-Host '[PASS] Installation and client certificate SAN verified!' -ForegroundColor Green

# 9. End-to-End Live HTTPS + Real SQL Server multi-user workflow test
Write-Step '9. Live HTTPS + SQL Server E2E (Admin init, User creation, Technician control+NOK+hours, Sequential saves, HTTP 409)'
$adminSession = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$loginAdmin = Invoke-Api $origin '/api/auth/login' 'POST' $adminSession @{ username = 'admin'; password = $adminPass }
if ($loginAdmin.user.username -ne 'admin') { throw 'Admin login returned unexpected user' }
Write-Host '[PASS] Admin logged in over HTTPS' -ForegroundColor Green

$techId = '33333333-3333-4333-8333-333333333333'
$techPass = 'TechWinCI-2026-Strong!'
$todayJalali = (& node.exe -e "const p=new Intl.DateTimeFormat('en-US-u-ca-persian-nu-latn',{timeZone:'Asia/Tehran',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()); const g=t=>p.find(x=>x.type===t).value; console.log(g('year')+'/'+g('month')+'/'+g('day'));").Trim()

$initState = @{
  v = 8
  groups = @(@{ id = 'grp-comp'; code = 'COMP'; name = 'Compressors'; icon = 'compressor'; description = 'Air Compressors'; displayOrder = 1; isActive = $true; trackHours = $true })
  equipments = @(@{ id = 'eq-1'; code = 'CMP-01'; name = 'Compressor 1'; groupId = 'grp-comp'; brand = 'Atlas'; model = 'GA55'; serial = 'SN-01'; capacity = '55kW'; hall = 'H1'; line = 'L1'; area = 'A1'; status = 'active'; commissionDate = '1403/01/01' })
  checklists = @(@{ id = 'cl-1'; name = 'Daily Compressor'; groupId = 'grp-comp' })
  sections = @(@{ id = 'sec-1'; checklistId = 'cl-1'; title = 'General'; order = 1 })
  items = @(
    @{ id = 'it-oil'; sectionId = 'sec-1'; title = 'Oil Level'; type = 'oknok' },
    @{ id = 'it-temp'; sectionId = 'sec-1'; title = 'Temperature'; type = 'numeric'; unit = 'C'; min = 40; max = 90; precision = 1 }
  )
  controls = @()
  drafts = @()
  opHours = @()
  failLocs = @(@{ id = 'fl-mechanical'; name = 'Mechanical' })
  shifts = @(
    @{ id = 'shift-1'; name = 'Shift 1'; from = '06:00'; to = '14:00' },
    @{ id = 'shift-2'; name = 'Shift 2'; from = '14:00'; to = '22:00' },
    @{ id = 'shift-3'; name = 'Shift 3'; from = '22:00'; to = '06:00' }
  )
  users = @(
    @{ id = $adminId; username = 'admin'; name = 'CI Admin'; role = 'admin'; active = $true; groupIds = 'all' },
    @{ id = $techId; username = 'tech01'; name = 'CI Technician'; role = 'technician'; active = $true; groupIds = @('grp-comp'); pass = $techPass }
  )
  logs = @(@{ id = 'log-init-1'; userId = $adminId; userName = 'CI Admin'; action = 'INSERT'; entity = 'Setup'; detail = 'Initial setup'; dateKey = $todayJalali; time = '08:00'; ip = 'client' })
  sync = @()
  branding = @{ logoText = 'NIPCO'; title = 'NIPCO Control'; subtitle = 'NIPCO'; welcome = 'Welcome'; footer = 'BEFORE-BACKUP-FOOTER'; version = '2.4.1'; primary = '#f5a623'; radius = 10 }
  layouts = @{}
  savedFilters = @()
  perms = @{
    admin = @{ 'dashboard:view' = $true }
    supervisor = @{ 'dashboard:view' = $true; 'control:view' = $true; 'control:submit' = $true; 'control:approve' = $true }
    engineer = @{ 'dashboard:view' = $true; 'control:view' = $true; 'control:submit' = $true; 'equipment:edit' = $true }
    technician = @{ 'dashboard:view' = $true; 'control:view' = $true; 'control:create' = $true; 'control:submit' = $true; 'reports:view' = $true; 'equipment:view' = $true }
    viewer = @{ 'dashboard:view' = $true; 'control:view' = $true; 'reports:view' = $true; 'equipment:view' = $true }
  }
  yearAccess = @{ '1405' = 'full' }
  archivedYears = @()
  theme = 'industrial'
}

$put1 = Invoke-Api $origin '/api/state' 'PUT' $adminSession @{ revision = 0; state = $initState }
if ([int]$put1.revision -ne 1) { throw "Expected revision 1, got $($put1.revision)" }
Write-Host '[PASS] Central SQL AppState initialized + tech01 created with Argon2id' -ForegroundColor Green

# Technician independent session
$techSession = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$loginTech = Invoke-Api $origin '/api/auth/login' 'POST' $techSession @{ username = 'tech01'; password = $techPass }
if ($loginTech.user.username -ne 'tech01') { throw 'Technician login failed' }
$techView = Invoke-Api $origin '/api/state' 'GET' $techSession
$adminView = Invoke-Api $origin '/api/state' 'GET' $adminSession

# Technician submits daily control with OK (including null/empty props) + NOK numeric + operating hours
$ctrlId = 'dc-' + [Guid]::NewGuid().ToString()
$ctrl = @{
  id = $ctrlId; equipmentId = 'eq-1'; dateKey = $todayJalali; shiftId = 'shift-1'; techId = $techId; status = 'nok'
  items = @{
    'it-oil' = @{ itemId = 'it-oil'; result = 'ok'; failLocId = $null; desc = '' }
    'it-temp' = @{ itemId = 'it-temp'; value = 96.5; result = 'nok'; failLocId = 'fl-mechanical'; desc = 'High temperature' }
  }
  opHours = 1500; opSource = 'MANUAL'; createdAt = "$todayJalali - 09:00"; submittedAt = "$todayJalali - 09:00"; startedAt = "$todayJalali - 08:55"
}
$techSubmitState = ConvertFrom-Json (ConvertTo-Json $techView.state -Depth 100 -Compress)
$techSubmitState | Add-Member -NotePropertyName users -NotePropertyValue @($techView.users) -Force
$techSubmitState.controls = @($ctrl)
$techSubmitState.opHours = @(@{ id = 'id-' + [Guid]::NewGuid().ToString(); equipmentId = 'eq-1'; hours = 1500; diff = $null; source = 'MANUAL'; techId = $techId; dateKey = $todayJalali; time = '09:00'; note = 'CI test' })
$techSubmitState.logs = @(@{ id = 'log-tech-1'; userId = $techId; userName = 'CI Technician'; action = 'INSERT'; entity = 'DailyControls'; detail = 'Submitted NOK form'; dateKey = $todayJalali; time = '09:00'; ip = 'client' })
$put2 = Invoke-Api $origin '/api/state' 'PUT' $techSession @{ revision = [int]$techView.revision; state = $techSubmitState }
if ([int]$put2.revision -ne 2) { throw "Expected revision 2, got $($put2.revision)" }
Write-Host '[PASS] Technician submitted daily control (OK+NOK+hours) to live SQL Server!' -ForegroundColor Green

# Sequential second save by technician using stampedLogs
$techSubmitState.logs = @($put2.stampedLogs) + @(@{ id = 'log-tech-2'; userId = $techId; userName = 'CI Technician'; action = 'EXPORT'; entity = 'Reports'; detail = 'Export CSV'; dateKey = $todayJalali; time = '09:01'; ip = 'client' })
$put3 = Invoke-Api $origin '/api/state' 'PUT' $techSession @{ revision = [int]$put2.revision; state = $techSubmitState }
if ([int]$put3.revision -ne 3) { throw "Expected revision 3, got $($put3.revision)" }
Write-Host '[PASS] Technician second sequential save succeeded with stampedLogs!' -ForegroundColor Green

# Stale snapshot from adminView (revision 1) must be rejected with HTTP 409!
$staleState = ConvertFrom-Json (ConvertTo-Json $adminView.state -Depth 100 -Compress)
$staleState | Add-Member -NotePropertyName users -NotePropertyValue @($adminView.users) -Force
$staleStatus = 0
try {
  [void](Invoke-Api $origin '/api/state' 'PUT' $adminSession @{ revision = [int]$adminView.revision; state = $staleState })
  $staleStatus = 200
} catch {
  if ($_.Exception.Response) { $staleStatus = [int]$_.Exception.Response.StatusCode } else { throw }
}
if ($staleStatus -ne 409) { throw "Expected HTTP 409 for stale snapshot, got $staleStatus" }
Write-Host '[PASS] Stale revision rejected with HTTP 409!' -ForegroundColor Green

# 10. Windows Service Restart persistence check
Write-Step '10. Restart NIPCOControl Windows Service and verify persistence'
Restart-Service -Name 'NIPCOControl' -Force
(Get-Service -Name 'NIPCOControl').WaitForStatus('Running', [TimeSpan]::FromSeconds(60))
$ready = $false
for ($i = 0; $i -lt 30; $i++) {
  try {
    $h = Invoke-RestMethod -Uri "$origin/api/health" -TimeoutSec 5
    if ($h.ok -and $h.database -eq 'connected') { $ready = $true; break }
  } catch { Start-Sleep -Seconds 2 }
}
if (-not $ready) { throw 'Service did not become healthy after Restart-Service' }
$afterRestart = Invoke-Api $origin '/api/state' 'GET' $adminSession
if ([int]$afterRestart.revision -ne 3 -or $afterRestart.state.controls.Count -ne 1) { throw 'Data was not preserved across service restart!' }
Write-Host '[PASS] Service restarted cleanly and all SQL records persisted (revision=3, controls=1)!' -ForegroundColor Green

# 11. Real SQL Backup + RESTORE VERIFYONLY + Mutate + RESTORE DATABASE + DBCC CHECKDB + Verify rollback!
Write-Step '11. Real SQL Backup, RESTORE VERIFYONLY, Restore-Database.ps1 & DBCC CHECKDB'
& (Join-Path $RepoRoot 'deploy\windows\Backup-Database.ps1') -AppRoot $TargetRoot
$bakFile = (Get-ChildItem -LiteralPath (Join-Path $TargetRoot 'Backups') -Filter '*.bak' -File | Sort-Object LastWriteTime -Descending | Select-Object -First 1).FullName
if (-not $bakFile) { throw 'Backup file not created' }
& (Join-Path $RepoRoot 'deploy\windows\Test-BackupFile.ps1') -BackupFile $bakFile -AppRoot $TargetRoot

# Mutate footer AFTER backup so we can prove Restore actually restores pre-backup state
$mutState = ConvertFrom-Json (ConvertTo-Json $afterRestart.state -Depth 100 -Compress)
$mutState.branding.footer = 'AFTER-BACKUP-MUST-DISAPPEAR'
$mutState | Add-Member -NotePropertyName users -NotePropertyValue @($afterRestart.users) -Force
$put4 = Invoke-Api $origin '/api/state' 'PUT' $adminSession @{ revision = [int]$afterRestart.revision; state = $mutState }
if ([int]$put4.revision -ne 4) { throw 'Post-backup mutation failed' }

# Execute full Restore-Database.ps1 (stops service, VERIFYONLY, RESTORE WITH REPLACE+CHECKSUM, relinks nipco_app, DBCC CHECKDB, marks verified=1, restarts service)
& (Join-Path $RepoRoot 'deploy\windows\Restore-Database.ps1') -BackupFile $bakFile -AppRoot $TargetRoot -Confirm:$false

$ready = $false
for ($i = 0; $i -lt 30; $i++) {
  try {
    $h = Invoke-RestMethod -Uri "$origin/api/health" -TimeoutSec 5
    if ($h.ok -and $h.database -eq 'connected') { $ready = $true; break }
  } catch { Start-Sleep -Seconds 2 }
}
if (-not $ready) { throw 'Service did not become healthy after Restore-Database.ps1' }

$afterRestore = Invoke-Api $origin '/api/state' 'GET' $adminSession
if ([string]$afterRestore.state.branding.footer -cne 'BEFORE-BACKUP-FOOTER') {
  throw "Expected footer BEFORE-BACKUP-FOOTER after restore, got: $($afterRestore.state.branding.footer)"
}
$backupsList = Invoke-Api $origin '/api/backups' 'GET' $adminSession
$verifiedRow = $backupsList.backups | Where-Object { $_.fileName -eq [IO.Path]::GetFileName($bakFile) } | Select-Object -First 1
if (-not $verifiedRow -or -not $verifiedRow.verified) { throw 'BackupHistory.verified was not updated to true after Restore + DBCC CHECKDB!' }
Write-Host '[PASS] Full Backup -> VerifyOnly -> Restore -> DBCC CHECKDB -> Service Recovery -> verified=true PASSED!' -ForegroundColor Green

Write-Host "`n============================================================" -ForegroundColor Green
Write-Host 'ALL WINDOWS SERVER + SQL SERVER E2E TESTS PASSED 100%!' -ForegroundColor Green
Write-Host '============================================================' -ForegroundColor Green
