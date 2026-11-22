[CmdletBinding()]
param(
  [ValidateSet('Standalone','Server')][string]$Mode = 'Standalone',
  [string]$TargetRoot = 'C:\NIPCO\Control',
  [string]$SqlServer = 'localhost',
  [string]$SqlInstance = '',
  [int]$SqlPort = 1433,
  [string]$Database = 'NIPCO_Control',
  [string]$PublicHost = '',
  [string]$SqlExpressInstaller = '',
  [string]$AppTimeZone = 'Asia/Tehran',
  [switch]$Resume,
  [switch]$UseExistingDatabase,
  [switch]$ConfigureSqlInstance
)
$ErrorActionPreference = 'Stop'
$SourceRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$LogDir = Join-Path $TargetRoot 'logs'
function Write-Log([string]$Message) {
  $line = "$(Get-Date -Format o) $Message"
  Write-Host $line
  if (Test-Path $LogDir) { Add-Content -LiteralPath (Join-Path $LogDir 'install.log') -Value $line }
}
function Assert-Admin {
  $id=[Security.Principal.WindowsIdentity]::GetCurrent()
  $p=New-Object Security.Principal.WindowsPrincipal($id)
  if (-not $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'PowerShell را با Run as administrator اجرا کنید.' }
}
function Read-Plain([string]$Prompt) { return (Read-Host $Prompt).Trim() }
function New-RandomSecret([int]$Length=36) {
  $chars='ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@$%_-'
  $rng=[Security.Cryptography.RandomNumberGenerator]::Create(); $bytes=New-Object byte[] $Length; $rng.GetBytes($bytes)
  $out = -join ($bytes | ForEach-Object { $chars[([int]$_ % $chars.Length)] }); $rng.Dispose(); return $out
}
function Sql-Exec([string]$ConnectionString,[string]$CommandText,[int]$Timeout=0) {
  $cn=New-Object System.Data.SqlClient.SqlConnection($ConnectionString)
  try { $cn.Open(); $cmd=$cn.CreateCommand(); $cmd.CommandText=$CommandText; $cmd.CommandTimeout=$Timeout; [void]$cmd.ExecuteNonQuery() }
  finally { if ($cn.State -eq 'Open') { $cn.Close() }; $cn.Dispose() }
}
function Sql-Scalar([string]$ConnectionString,[string]$CommandText) {
  $cn=New-Object System.Data.SqlClient.SqlConnection($ConnectionString)
  try { $cn.Open(); $cmd=$cn.CreateCommand(); $cmd.CommandText=$CommandText; return $cmd.ExecuteScalar() }
  finally { if ($cn.State -eq 'Open') { $cn.Close() }; $cn.Dispose() }
}

try {
  Assert-Admin
  if ($PSVersionTable.PSVersion.Major -lt 5) { throw 'Windows PowerShell 5.1 یا جدیدتر لازم است.' }
  $targetExists = Test-Path -LiteralPath $TargetRoot
  if ($targetExists -and -not $Resume) { throw "مسیر مقصد از قبل وجود دارد: $TargetRoot . برای ادامه نصب نیمه‌تمام فقط با -Resume اجرا کنید؛ داده‌های قبلی حذف نمی‌شوند." }
  if ($Resume -and -not $targetExists) { throw 'پارامتر -Resume فقط برای ادامه نصب نیمه‌تمام در پوشه موجود قابل استفاده است.' }
  $existingNipcoService=Get-Service -Name 'NIPCOControl' -ErrorAction SilentlyContinue
  if ($existingNipcoService -and -not $Resume) { throw 'سرویس NIPCOControl از قبل وجود دارد؛ برای بازیابی نصب نیمه‌تمام، -Resume را مشخص کنید.' }
  if ($existingNipcoService -and $existingNipcoService.Status -ne 'Stopped') { Stop-Service NIPCOControl -Force; $existingNipcoService.WaitForStatus('Stopped',[TimeSpan]::FromSeconds(60)) }
  New-Item -ItemType Directory -Force -Path (Join-Path $TargetRoot 'logs') | Out-Null
  if (-not [Environment]::Is64BitOperatingSystem) { throw 'نصب فقط روی Windows 64-bit پشتیبانی می‌شود.' }
  if ($Mode -eq 'Server') {
    $os=Get-CimInstance Win32_OperatingSystem
    if ($os.Caption -notmatch 'Windows Server') { throw "حالت Server فقط روی Windows Server مجاز است. سیستم فعلی: $($os.Caption)" }
    if (-not $PublicHost) { $PublicHost=Read-Plain 'نام DNS یا نام سرور که کلاینت‌ها استفاده می‌کنند (مثلاً nipco-srv.company.local)' }
  } else {
    $os=Get-CimInstance Win32_OperatingSystem
    if ($os.Caption -notmatch 'Windows 10|Windows 11') { throw "حالت Standalone برای Windows 10/11 است. سیستم فعلی: $($os.Caption)" }
    $PublicHost='localhost'
  }
  if (-not $PublicHost -or $PublicHost -notmatch '^(?=.{1,253}$)[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*$') { throw 'نام میزبان معتبر نیست؛ فقط hostname/DNS بدون مسیر، پورت یا فاصله وارد کنید.' }
  if ($Mode -eq 'Server') {
    if ($PublicHost -in @('localhost','127.0.0.1','::1')) { throw 'در حالت Server باید نام DNS قابل دسترسی از کلاینت‌ها وارد شود، نه localhost.' }
    try { [void][System.Net.Dns]::GetHostAddresses($PublicHost) } catch { throw "نام DNS سرور resolve نمی‌شود: $PublicHost" }
  }
  if ($SqlServer -notin @('localhost','127.0.0.1',$env:COMPUTERNAME)) { throw 'این نصب‌کننده SQL Server را روی همین رایانه میزبان برنامه مدیریت می‌کند؛ SQL_HOST باید localhost یا نام همین رایانه باشد.' }
  # Validate with Node's ICU/IANA database; Windows PowerShell/.NET Framework uses Windows timezone IDs.
  & node.exe -e "new Intl.DateTimeFormat('en-US',{timeZone:process.argv[1]}).format();" $AppTimeZone 2>$null
  if ($LASTEXITCODE -ne 0) { throw "شناسه منطقه زمانی IANA نامعتبر است: $AppTimeZone (مانند Asia/Tehran یا Asia/Baku)." }
  if ($Database -notmatch '^[A-Za-z0-9_]{1,128}$') { throw 'نام دیتابیس فقط باید شامل حروف انگلیسی، عدد و underscore باشد.' }
  if ($SqlPort -lt 1 -or $SqlPort -gt 65535) { throw 'پورت SQL باید بین 1 و 65535 باشد.' }

  $nodeCmd=Get-Command node.exe -ErrorAction SilentlyContinue
  if (-not $nodeCmd) { throw 'Node.js نسخه 22.12 یا جدیدتر نصب نیست. ابتدا Node.js 26 LTS x64 (یا نسخه پشتیبانی‌شده) را نصب کنید و دوباره اجرا کنید؛ حداقل فنی نسخه 22.12 است.' }
  $nodeArch=(& node.exe -p 'process.arch').Trim()
  if ($nodeArch -ne 'x64') { throw "نسخه Node.js باید x64 باشد؛ معماری فعلی: $nodeArch" }
  $nodeVersion=(& node.exe --version).Trim()
  if ($nodeVersion -notmatch '^v(\d+)\.(\d+)\.' -or ([int]$Matches[1] -lt 22) -or (([int]$Matches[1] -eq 22) -and ([int]$Matches[2] -lt 12))) { throw "نسخه Node.js پشتیبانی نمی‌شود: $nodeVersion (حداقل v22.12 لازم است)." }

  $sqlInstalledByInstaller = $false
  $sqlServices = @(Get-Service -ErrorAction SilentlyContinue | Where-Object { $_.Name -eq 'MSSQLSERVER' -or $_.Name -like 'MSSQL$*' })
  if (-not $sqlServices.Count -and $SqlExpressInstaller) {
    if (-not (Test-Path -LiteralPath $SqlExpressInstaller -PathType Leaf)) { throw "فایل نصب SQL Express پیدا نشد: $SqlExpressInstaller" }
    if ([IO.Path]::GetFileName($SqlExpressInstaller) -match 'SSEI-Expr') { throw 'این فایل bootstrapper کوچک SQL Express است؛ ابتدا از آن Download Media را بگیرید، سپس مسیر setup.exe داخل رسانه کامل را به -SqlExpressInstaller بدهید.' }
    if ([IO.Path]::GetFileName($SqlExpressInstaller) -ine 'setup.exe') { throw 'برای نصب بی‌صدا، -SqlExpressInstaller باید به setup.exe داخل رسانه کامل SQL Server اشاره کند، نه فایل دانلودکننده.' }
    Write-Log 'Installing supplied SQL Server Express setup media...'
    $instance='SQLEXPRESS'
    $setupArgs=@('/Q','/ACTION=Install','/FEATURES=SQLEngine',"/INSTANCENAME=$instance",'/SQLSVCSTARTUPTYPE=Automatic','/TCPENABLED=1',('/SQLSYSADMINACCOUNTS="{0}"' -f ("$env:USERDOMAIN\$env:USERNAME")),'/IACCEPTSQLSERVERLICENSETERMS','/UpdateEnabled=False')
    $proc=Start-Process -FilePath $SqlExpressInstaller -ArgumentList $setupArgs -Wait -PassThru
    if ($proc.ExitCode -notin @(0,3010)) { throw "SQL Server Express installation failed with exit code $($proc.ExitCode). Check SQL setup bootstrap logs." }
    $SqlInstance='SQLEXPRESS'
    $sqlInstalledByInstaller = $true
    $sqlServices = @(Get-Service -Name 'MSSQL$SQLEXPRESS' -ErrorAction SilentlyContinue)
  }
  if ($SqlInstance) {
    if ($SqlInstance -eq 'MSSQLSERVER') { $wantedService='MSSQLSERVER' }
    elseif ($SqlInstance -match '^[A-Za-z0-9_]{1,16}$') { $wantedService='MSSQL$' + $SqlInstance }
    else { throw 'نام SQL Instance معتبر نیست؛ مانند MSSQLSERVER یا SQLEXPRESS وارد کنید.' }
    $sqlService=Get-Service -Name $wantedService -ErrorAction SilentlyContinue
    if (-not $sqlService) { throw "نمونه SQL انتخاب‌شده پیدا نشد: $wantedService" }
  } else {
    if ($sqlServices.Count -gt 1) { throw ('چند SQL Instance نصب است: ' + (($sqlServices | ForEach-Object {$_.Name}) -join ', ') + '. پارامتر -SqlInstance را صریح مشخص کنید.') }
    if ($sqlServices.Count -eq 0) { throw 'SQL Server Database Engine یافت نشد. SQL Server را نصب کنید یا رسانه کامل Express را با -SqlExpressInstaller بدهید.' }
    $sqlService=$sqlServices[0]
    $SqlInstance=if ($sqlService.Name -eq 'MSSQLSERVER') { 'MSSQLSERVER' } else { $sqlService.Name -replace '^MSSQL\$','' }
  }
  Set-Service -Name $sqlService.Name -StartupType Automatic
  if ($sqlService.Status -ne 'Running') { Start-Service -Name $sqlService.Name; (Get-Service -Name $sqlService.Name).WaitForStatus('Running',[TimeSpan]::FromSeconds(120)) }
  $sqlService=Get-Service -Name $sqlService.Name

  # For a local SQL instance, configure SQL authentication and a stable TCP port.
  $localHosts=@('localhost','127.0.0.1',$env:COMPUTERNAME)
  if (($localHosts -contains $SqlServer) -and ($sqlInstalledByInstaller -or $ConfigureSqlInstance)) {
    $instancesPath='HKLM:\SOFTWARE\Microsoft\Microsoft SQL Server\Instance Names\SQL'
    if (Test-Path $instancesPath) {
      $instances=Get-ItemProperty $instancesPath
      $instanceName=if ($sqlService.Name -eq 'MSSQLSERVER') { 'MSSQLSERVER' } else { ($sqlService.Name -replace '^MSSQL\$','') }
      $instanceId=$instances.$instanceName
      if ($instanceId) {
        $instanceRoot="HKLM:\SOFTWARE\Microsoft\Microsoft SQL Server\$instanceId"
        $setupPath=Join-Path $instanceRoot 'MSSQLServer'
        New-ItemProperty -Path $setupPath -Name LoginMode -Value 2 -PropertyType DWord -Force | Out-Null
        $tcpRoot=Join-Path $instanceRoot 'MSSQLServer\SuperSocketNetLib\Tcp'
        if (Test-Path $tcpRoot) {
          Set-ItemProperty -Path $tcpRoot -Name Enabled -Value 1
          $ipAll=Join-Path $tcpRoot 'IPAll'
          if (Test-Path $ipAll) { Set-ItemProperty -Path $ipAll -Name TcpDynamicPorts -Value ''; Set-ItemProperty -Path $ipAll -Name TcpPort -Value ([string]$SqlPort) }
        }
        Restart-Service -Name $sqlService.Name -Force
        (Get-Service -Name $sqlService.Name).WaitForStatus('Running',[TimeSpan]::FromSeconds(90))
      } else { throw 'مسیر رجیستری نمونه SQL پیدا نشد؛ پیکربندی دستی TCP و Mixed Mode لازم است.' }
    }
  } elseif (-not $sqlInstalledByInstaller) {
    Write-Log 'Existing SQL instance settings were left unchanged. It must already use Mixed Mode and listen on the selected static TCP port.'
  }

  $dbaBuilder=New-Object System.Data.SqlClient.SqlConnectionStringBuilder
  $dbaBuilder['Data Source']=if ($SqlServer.Contains(',')) { $SqlServer } else { "$SqlServer,$SqlPort" }
  $dbaBuilder['Initial Catalog']='master'; $dbaBuilder['Integrated Security']=$true; $dbaBuilder['Encrypt']=$true; $dbaBuilder['TrustServerCertificate']=$true; $dbaBuilder['Connect Timeout']=15
  $dbaCs=$dbaBuilder.ConnectionString
  $sqlMajor=[int](Sql-Scalar $dbaCs "SELECT CAST(SERVERPROPERTY('ProductMajorVersion') AS int)")
  $windowsOnly=[int](Sql-Scalar $dbaCs "SELECT CONVERT(int,SERVERPROPERTY('IsIntegratedSecurityOnly'))")
  if ($windowsOnly -eq 1) { throw 'SQL Server در حالت Windows Authentication Only است؛ Mixed Mode را در SQL Server Configuration Manager فعال کنید و سرویس را Restart کنید. در صورت تأیید توقف سایر برنامه‌های متصل، می‌توانید -ConfigureSqlInstance را اجرا کنید.' }
  if ($sqlMajor -lt 15) { throw "برای نصب عملیاتی SQL Server 2019 یا جدیدتر لازم است (پیشنهاد: 2022 یا 2025). نسخه اصلی شناسایی‌شده: $sqlMajor" }
  Write-Log "SQL Server major version: $sqlMajor; selected instance: $SqlInstance"
  $exists=Sql-Scalar $dbaCs "SELECT DB_ID(N'$Database')"
  $databaseAlreadyExists=($null -ne $exists -and $exists -isnot [DBNull] -and [int]$exists -gt 0)
  if ($databaseAlreadyExists -and -not $Resume -and -not $UseExistingDatabase) { throw "Database $Database already exists. To protect existing data, use a new database name, or explicitly pass -UseExistingDatabase after taking a verified backup." }
  if (-not $databaseAlreadyExists) { Sql-Exec $dbaCs "CREATE DATABASE [$Database]" 0 }
  $hasUsers=[int](Sql-Scalar $dbaCs "SELECT CASE WHEN OBJECT_ID(N'[$Database].control.Users',N'U') IS NULL THEN 0 ELSE 1 END")
  $hasSessions=[int](Sql-Scalar $dbaCs "SELECT CASE WHEN OBJECT_ID(N'[$Database].control.Sessions',N'U') IS NULL THEN 0 ELSE 1 END")
  if (($hasUsers -eq 1) -xor ($hasSessions -eq 1)) { throw 'ساختار جداول ورود ناقص یا ناسازگار است؛ نصب خودکار متوقف شد تا از تغییر دیتابیس ناشناخته جلوگیری شود.' }
  if ($hasUsers -eq 0) {
    # A fresh database has no auth tables yet. A previous partial bootstrap can be resumed safely.
    Write-Log 'Authentication schema not present yet; applying the initial migration.'
  } else {
    Write-Log 'Existing NIPCO authentication tables detected; preserving existing users and sessions.'
  }

  $appLogin='nipco_app'; $appSqlPassword=New-RandomSecret 40
  $loginSql="IF NOT EXISTS (SELECT 1 FROM sys.sql_logins WHERE name=N'$appLogin') BEGIN CREATE LOGIN [$appLogin] WITH PASSWORD=N'$appSqlPassword', CHECK_POLICY=ON, CHECK_EXPIRATION=OFF; END ELSE ALTER LOGIN [$appLogin] WITH PASSWORD=N'$appSqlPassword', CHECK_POLICY=ON, CHECK_EXPIRATION=OFF; ALTER LOGIN [$appLogin] ENABLE;"
  Sql-Exec $dbaCs $loginSql 0
  $dbAdminBuilder=New-Object System.Data.SqlClient.SqlConnectionStringBuilder($dbaCs)
  $dbAdminBuilder['Initial Catalog']=$Database
  $dbAdminCs=$dbAdminBuilder.ConnectionString
  $loginDbSql="IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name=N'$appLogin') CREATE USER [$appLogin] FOR LOGIN [$appLogin]; IF IS_ROLEMEMBER(N'db_backupoperator',N'$appLogin') <> 1 ALTER ROLE db_backupoperator ADD MEMBER [$appLogin];"
  Sql-Exec $dbAdminCs $loginDbSql 0
  $migrationTable="IF OBJECT_ID(N'dbo.NIPCO_Migrations',N'U') IS NULL CREATE TABLE dbo.NIPCO_Migrations(version NVARCHAR(100) NOT NULL PRIMARY KEY, applied_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME());"
  Sql-Exec $dbAdminCs $migrationTable 0
  foreach ($migration in @('001_auth.sql','003_app_state_and_users.sql','004_remove_embedded_user_credentials.sql','005_runtime_least_privilege.sql')) {
    $version=$migration.Replace("'","''")
    $applied=Sql-Scalar $dbAdminCs "SELECT COUNT(1) FROM dbo.NIPCO_Migrations WHERE version=N'$version'"
    if ([int]$applied -eq 0) {
      if ($migration -eq '001_auth.sql') {
        $authTables=[int](Sql-Scalar $dbAdminCs "SELECT CASE WHEN OBJECT_ID(N'control.Users',N'U') IS NOT NULL AND OBJECT_ID(N'control.Sessions',N'U') IS NOT NULL THEN 1 ELSE 0 END")
        if ($authTables -eq 1) {
          Write-Log 'Auth schema already exists; marking migration 001 as present without changing existing users.'
          Sql-Exec $dbAdminCs "INSERT INTO dbo.NIPCO_Migrations(version) VALUES(N'$version')" 0
          continue
        }
      }
      Write-Log "Applying SQL migration $migration"
      $scriptText=Get-Content -LiteralPath (Join-Path $SourceRoot "server\sql\$migration") -Raw
      foreach ($batch in [regex]::Split($scriptText,'(?im)^\s*GO\s*(?:--.*)?$')) {
        if (-not [string]::IsNullOrWhiteSpace($batch)) { Sql-Exec $dbAdminCs $batch 0 }
      }
      Sql-Exec $dbAdminCs "INSERT INTO dbo.NIPCO_Migrations(version) VALUES(N'$version')" 0
    }
  }
  $existingUserCount=[int](Sql-Scalar $dbAdminCs 'SELECT COUNT(1) FROM control.Users')
  $needsBootstrap=($existingUserCount -eq 0)

  New-Item -ItemType Directory -Force -Path $TargetRoot | Out-Null
  New-Item -ItemType Directory -Force -Path (Join-Path $TargetRoot 'logs'),(Join-Path $TargetRoot 'Backups'),(Join-Path $TargetRoot 'secrets'),(Join-Path $TargetRoot 'certificates') | Out-Null
  $backupPath=Join-Path $TargetRoot 'Backups'
  # SQL Server itself writes .bak files, not the Node service or the scheduled task.
  # Grant the database engine identity write access even when an existing SQL instance
  # is deliberately left otherwise untouched by this installer.
  if ($localHosts -contains $SqlServer) {
    $sqlServiceConfig=Get-CimInstance Win32_Service -Filter "Name='$($sqlService.Name)'" -ErrorAction SilentlyContinue
    if (-not $sqlServiceConfig -or -not $sqlServiceConfig.StartName) {
      throw 'حساب سرویس SQL Server شناسایی نشد؛ دسترسی نوشتن پوشه Backups را به‌صورت دستی برای حساب سرویس SQL فراهم کنید.'
    }
    $sqlBackupIdentity=[string]$sqlServiceConfig.StartName
    & icacls.exe $backupPath /grant "${sqlBackupIdentity}:(OI)(CI)M" | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "اعطای مجوز نوشتن پوشه پشتیبان به حساب سرویس SQL ناموفق بود: $sqlBackupIdentity" }
    Write-Log "Granted SQL backup folder access to database engine identity: $sqlBackupIdentity"
  }
  robocopy $SourceRoot $TargetRoot /E /XD node_modules .git Backups logs secrets certificates dist '#تصاویر-نمونه' /XF .env '*.log' '*.docx' | Out-Null
  if ($LASTEXITCODE -ge 8) { throw "کپی فایل‌های برنامه ناموفق بود. Robocopy exit code: $LASTEXITCODE" }

  Write-Log 'Installing frontend and backend dependencies; internet access is required for npm package retrieval unless cache is populated.'
  Push-Location $TargetRoot
  try {
    npm ci --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { throw 'npm ci for frontend failed.' }
    npm run typecheck
    if ($LASTEXITCODE -ne 0) { throw 'Frontend typecheck failed.' }
    npm run build
    if ($LASTEXITCODE -ne 0) { throw 'Frontend production build failed.' }
    Push-Location (Join-Path $TargetRoot 'server')
    try { npm ci --omit=dev --no-audit --no-fund; if ($LASTEXITCODE -ne 0) { throw 'Backend npm ci failed.' } }
    finally { Pop-Location }
  } finally { Pop-Location }

  $certDns=@($PublicHost)
  if ($Mode -eq 'Standalone') { $certDns=@('localhost') }
  $cert=New-SelfSignedCertificate -DnsName $certDns -CertStoreLocation 'Cert:\LocalMachine\My' -KeyAlgorithm RSA -KeyLength 2048 -KeyExportPolicy Exportable -HashAlgorithm SHA256 -NotAfter (Get-Date).AddYears(3)
  $pfxPassword=New-RandomSecret 48
  $pfxSecure=ConvertTo-SecureString -String $pfxPassword -Force -AsPlainText
  $pfxPath=Join-Path $TargetRoot 'secrets\server.pfx'
  Export-PfxCertificate -Cert $cert -FilePath $pfxPath -Password $pfxSecure | Out-Null
  $cerPath=Join-Path $TargetRoot 'certificates\NIPCO-Control.cer'
  Export-Certificate -Cert $cert -FilePath $cerPath | Out-Null
  Set-Content -LiteralPath (Join-Path $TargetRoot 'certificates\NIPCO-Control.thumbprint.txt') -Value $cert.Thumbprint -Encoding ASCII
  Import-Certificate -FilePath $cerPath -CertStoreLocation 'Cert:\LocalMachine\Root' | Out-Null

  $publicOrigin="https://$PublicHost`:8443"
  $bindAddress=if ($Mode -eq 'Standalone') { '127.0.0.1' } else { '0.0.0.0' }
  $envText=@"
NODE_ENV=production
APP_TIME_ZONE=$AppTimeZone
PORT=8443
BIND_ADDRESS=$bindAddress
PUBLIC_ORIGIN=$publicOrigin
TLS_PFX_PATH=secrets/server.pfx
TLS_PFX_PASSWORD=$pfxPassword
SQL_HOST=$SqlServer
SQL_PORT=$SqlPort
SQL_DATABASE=$Database
SQL_USER=$appLogin
SQL_PASSWORD=$appSqlPassword
SQL_TRUST_CERT=true
"@
  [IO.File]::WriteAllText((Join-Path $TargetRoot '.env'),$envText,(New-Object System.Text.UTF8Encoding($false)))
  $acl=Get-Acl (Join-Path $TargetRoot 'secrets\server.pfx')
  $acl.SetAccessRuleProtection($true,$false)
  $system=New-Object System.Security.AccessControl.FileSystemAccessRule('SYSTEM','FullControl','Allow')
  $admins=New-Object System.Security.AccessControl.FileSystemAccessRule('BUILTIN\Administrators','FullControl','Allow')
  $acl.SetAccessRule($system); $acl.AddAccessRule($admins); Set-Acl -Path (Join-Path $TargetRoot 'secrets\server.pfx') -AclObject $acl
  $envAcl=Get-Acl (Join-Path $TargetRoot '.env'); $envAcl.SetAccessRuleProtection($true,$false); $envAcl.SetAccessRule($system); $envAcl.AddAccessRule($admins); Set-Acl (Join-Path $TargetRoot '.env') $envAcl

  $nodePath=(Get-Command node.exe).Source
  [Environment]::SetEnvironmentVariable('NIPCO_APP_ROOT',$TargetRoot,'Machine')
  [Environment]::SetEnvironmentVariable('NIPCO_NODE_PATH',$nodePath,'Machine')
  $cscCandidates=@("$env:WINDIR\Microsoft.NET\Framework64\v4.0.30319\csc.exe","$env:WINDIR\Microsoft.NET\Framework\v4.0.30319\csc.exe")
  $csc=$cscCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
  if (-not $csc) { throw '.NET Framework C# compiler not found; cannot create Windows service host.' }
  $serviceExe=Join-Path $TargetRoot 'NIPCOControlService.exe'
  & $csc /nologo /target:exe /out:$serviceExe /reference:System.ServiceProcess.dll (Join-Path $TargetRoot 'deploy\windows\ServiceHost.cs')
  if ($LASTEXITCODE -ne 0 -or -not (Test-Path $serviceExe)) { throw 'Compiling Windows Service Host failed.' }
  if (-not (Get-Service -Name 'NIPCOControl' -ErrorAction SilentlyContinue)) {
    & sc.exe create NIPCOControl binPath= "`"$serviceExe`"" start= auto DisplayName= "NIPCO Daily Equipment Control"
    if ($LASTEXITCODE -ne 0) { throw 'Creating Windows service failed.' }
  } else { Write-Log 'Reusing the existing NIPCOControl service during recovery installation.' }
  & sc.exe description NIPCOControl "NIPCO Daily Equipment Control API and web application"
  & sc.exe config NIPCOControl obj= "NT SERVICE\NIPCOControl" password= "" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Configuring the restricted service identity failed.' }
  & icacls.exe $TargetRoot /grant "NT SERVICE\NIPCOControl:(OI)(CI)RX" /T | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Granting service read/execute access to application files failed.' }
  & icacls.exe (Join-Path $TargetRoot 'logs') /grant "NT SERVICE\NIPCOControl:(OI)(CI)M" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Granting service write access to logs failed.' }
  & icacls.exe (Join-Path $TargetRoot 'secrets\server.pfx') /grant "NT SERVICE\NIPCOControl:R" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Granting service read access to TLS private key file failed.' }
  & icacls.exe (Join-Path $TargetRoot '.env') /grant "NT SERVICE\NIPCOControl:R" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Granting service read access to private configuration failed.' }
  & sc.exe config NIPCOControl depend= $($sqlService.Name) | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Configuring SQL Server service dependency failed.' }
  & sc.exe failure NIPCOControl reset= 86400 actions= restart/5000/restart/15000/restart/30000 | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Configuring Windows service recovery actions failed.' }
  if ($Mode -eq 'Server') { New-NetFirewallRule -DisplayName 'NIPCO Control HTTPS 8443' -Direction Inbound -Protocol TCP -LocalPort 8443 -Action Allow -Profile Domain,Private -ErrorAction SilentlyContinue | Out-Null }

  $backupScript=Join-Path $TargetRoot 'deploy\windows\Backup-Database.ps1'
  $action=New-ScheduledTaskAction -Execute 'PowerShell.exe' -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$backupScript`" -AppRoot `"$TargetRoot`" -RetentionDays 30"
  $trigger=New-ScheduledTaskTrigger -Daily -At 2:00am
  $principal=New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
  Register-ScheduledTask -TaskName 'NIPCO Control Daily SQL Backup' -Action $action -Trigger $trigger -Principal $principal -Description 'Daily full SQL Server backup with CHECKSUM; restore testing is a separate DBA operation' -Force | Out-Null

  if ($needsBootstrap) {
    Write-Log 'Provision the first administrator. Password input is hidden and Argon2id-hashed.'
    Push-Location $TargetRoot
    try { node .\server\src\bootstrap-admin.js; if ($LASTEXITCODE -ne 0) { throw 'Initial administrator bootstrap failed.' } }
    finally { Pop-Location }
  } else { Write-Log 'Existing administrator account detected; bootstrap skipped to preserve current accounts.' }

  $currentService=Get-Service NIPCOControl
  if ($currentService.Status -eq 'Running') { Restart-Service NIPCOControl -Force; (Get-Service NIPCOControl).WaitForStatus('Running',[TimeSpan]::FromSeconds(60)) }
  else { Start-Service NIPCOControl; (Get-Service NIPCOControl).WaitForStatus('Running',[TimeSpan]::FromSeconds(60)) }
  $svc=Get-Service NIPCOControl; $svc.WaitForStatus('Running',[TimeSpan]::FromSeconds(45))
  $health=$null; $healthError='پاسخی دریافت نشد'; $healthDeadline=(Get-Date).AddMinutes(2)
  while ((Get-Date) -lt $healthDeadline -and -not $health) {
    try { $candidate=Invoke-RestMethod -Uri "$publicOrigin/api/health" -TimeoutSec 10; if ($candidate.ok -and $candidate.database -eq 'connected') { $health=$candidate } else { $healthError='API یا اتصال SQL Server هنوز آماده نیست' } }
    catch { $healthError=$_.Exception.Message; Start-Sleep -Seconds 3 }
  }
  if (-not $health) { throw "Service installed but health check failed after 2 minutes: $healthError. Check logs\service-host.log and logs\install.log." }

  Write-Log "INSTALLATION SUCCEEDED. SQL instance: $SqlInstance; URL: $publicOrigin"
  Write-Host "`nنصب انجام شد. آدرس برنامه: $publicOrigin" -ForegroundColor Green
  Write-Host "گواهی کلاینت: $cerPath" -ForegroundColor Yellow
  Write-Host "SQL Instance: $SqlInstance | Database: $Database | Mode: $Mode" -ForegroundColor Cyan
  Write-Host "گزارش نصب: $(Join-Path $TargetRoot 'logs\install.log')" -ForegroundColor Yellow
  if ($Mode -eq 'Server') { Write-Host 'فایل certificates\NIPCO-Control.cer را به رایانه‌های کلاینت منتقل و در Trusted Root Certification Authorities نصب کنید.' -ForegroundColor Cyan }
  if ($Resume) { Write-Host 'حالت بازیابی نصب نیمه‌تمام فعال بود؛ رکوردهای قبلی دیتابیس/کاربران حفظ شدند.' -ForegroundColor Yellow }
  Write-Host 'هشدار: نصب فقط زمانی تأیید شده است که health check موفق باشد؛ آزمون چندکاربره و بازیابی واقعی باید در محیط مقصد انجام شود.' -ForegroundColor Yellow
} catch {
  if (Test-Path $LogDir) { Write-Log ("INSTALLATION FAILED: " + $_.Exception.Message) }
  Write-Error $_
  exit 1
}
