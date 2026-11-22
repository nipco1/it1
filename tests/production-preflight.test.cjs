const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('browser source does not persist application data or credentials in Web Storage', () => {
  const files = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
      const relative = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(relative);
      else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) files.push(relative);
    }
  };
  walk('src');
  for (const file of files) {
    const source = read(file);
    assert.doesNotMatch(source, /\b(?:localStorage|sessionStorage)\s*(?:\.|\[)/, `${file} must not store sensitive app state in browser storage`);
  }
});

test('login page has no sample credentials or quick-login shortcuts', () => {
  const source = read('src/views/Login.tsx');
  assert.match(source, /login\(u, p\)/);
  assert.doesNotMatch(source, /tech1|technician\s*\/|ورود سریع|رمز پیش.?فرض|admin123/i);
});

test('production seed does not create fake assets, users or inspection records', () => {
  const seed = read('src/lib/seed.ts');
  assert.match(seed, /groups:\s*\[\]/);
  assert.match(seed, /equipments:\s*\[\]/);
  assert.match(seed, /controls:\s*\[\]/);
  assert.match(seed, /users:\s*\[\]/);
});

test('all client data mutations go through authenticated state API and the server uses SQL transactions', () => {
  const store = read('src/lib/store.ts');
  const api = read('server/src/app.js');
  const sqlStore = read('server/src/sql-store.js');
  assert.match(store, /fetch\(url/);
  assert.match(store, /"\/api\/state"/);
  assert.match(api, /app\.get\('\/api\/state'/);
  assert.match(api, /app\.put\('\/api\/state'/);
  assert.match(api, /app\.get\('\/api\/state\/revision'/);
  assert.match(store, /refreshRemoteState/);
  assert.match(sqlStore, /ISOLATION_LEVEL\.SERIALIZABLE/);
  assert.match(sqlStore, /UPDLOCK,HOLDLOCK/);
  assert.match(sqlStore, /control\.AppState/);
});

test('server authentication uses Argon2id, secure HttpOnly cookies and throttled login', () => {
  const app = read('server/src/app.js');
  const bootstrap = read('server/src/bootstrap-admin.js');
  assert.match(app, /httpOnly:\s*true/);
  assert.match(app, /secure:\s*true/);
  assert.match(app, /sameSite:\s*'strict'/);
  assert.match(app, /rateLimit\(/);
  assert.match(bootstrap, /argon2\.argon2id/);
  assert.match(bootstrap, /14/);
});

test('daily inspection input validation rejects bad data and derives OK/NOK on the server', () => {
  const validation = read('server/src/control-validation.js');
  const app = read('server/src/app.js');
  assert.match(validation, /isValidJalaliDate/);
  assert.match(validation, /item\.min/);
  assert.match(validation, /item\.max/);
  assert.match(app, /validateControl\(/);
  assert.match(app, /currentJalaliDate/);
});

test('Windows deployment kit includes standalone, server service, backup, restore and client trust tools', () => {
  for (const file of [
    'deploy/windows/Install-NIPCO.ps1',
    'deploy/windows/Test-Readiness.ps1',
    'deploy/windows/Backup-Database.ps1',
    'deploy/windows/Restore-Database.ps1',
    'deploy/windows/ServiceHost.cs',
    'deploy/windows/Install-ClientCertificate.ps1',
    'deploy/windows/Verify-Installation.ps1',
  ]) assert.ok(fs.existsSync(path.join(root, file)), `missing deployment file ${file}`);
  const installer = read('deploy/windows/Install-NIPCO.ps1');
  assert.match(installer, /ValidateSet\('Standalone','Server'\)/);
  assert.match(installer, /sc\.exe create NIPCOControl/);
  assert.match(installer, /New-ScheduledTaskTrigger -Daily/);
  assert.match(installer, /NIPCO-Control\.thumbprint\.txt/);
  assert.match(installer, /8443/);
  const preflight = read('deploy/windows/Test-Readiness.ps1');
  assert.match(preflight, /freeGB -ge 10/);
});

test('backup is a checksum SQL backup; restore performs verification and DBCC CHECKDB', () => {
  const backup = read('deploy/windows/Backup-Database.ps1');
  const restore = read('deploy/windows/Restore-Database.ps1');
  assert.match(backup, /BACKUP DATABASE/);
  assert.match(backup, /CHECKSUM/);
  assert.match(restore, /RESTORE VERIFYONLY/);
  assert.match(restore, /RESTORE DATABASE/);
  assert.match(restore, /DBCC CHECKDB/);
});

test('audit log sequence is append-only and UI reverses it for newest-first display', () => {
  const store = read('src/lib/store.ts');
  const dashboard = read('src/views/Dashboard.tsx');
  const settings = read('src/views/Settings.tsx');
  assert.match(store, /next\.logs\.push\(/);
  assert.doesNotMatch(store, /next\.logs\.unshift\(/);
  assert.match(dashboard, /db\.logs\.slice\(-8\)\.reverse\(\)/);
  assert.match(settings, /db\.logs\.filter\([\s\S]*?\)\.reverse\(\)/);
});

test('standalone binds only to localhost; server mode binds to LAN and uses an explicit SQL instance selector', () => {
  const installer = read('deploy/windows/Install-NIPCO.ps1');
  const index = read('server/src/index.js');
  assert.match(installer, /BIND_ADDRESS=\$bindAddress/);
  assert.match(installer, /-SqlInstance/);
  assert.match(installer, /ConfigureSqlInstance/);
  assert.match(installer, /SQL Server 2019 یا جدیدتر/);
  assert.match(index, /process\.env\.BIND_ADDRESS\s*\|\|\s*'127\.0\.0\.1'/);
});


test('local-only UI preview assets do not depend on Google Fonts or a deleted image export', () => {
  const html = read('index.html');
  const settings = read('src/views/Settings.tsx');
  const login = read('src/views/Login.tsx');
  assert.doesNotMatch(html, /fonts\.googleapis\.com|fonts\.gstatic\.com/);
  assert.doesNotMatch(settings, /COVER_IMG/);
  assert.match(settings, /industrial-cover/);
  assert.doesNotMatch(login, /سوله\s*۱\s*تا\s*۳/);
});

test('installer validates IANA timezone using the bundled Node runtime, not Windows .NET timezone IDs', () => {
  const installer = read('deploy/windows/Install-NIPCO.ps1');
  assert.match(installer, /Intl\.DateTimeFormat/);
  assert.doesNotMatch(installer, /TimeZoneInfo\]::FindSystemTimeZoneById/);
  assert.match(installer, /-not \$sqlServices\.Count -and \$SqlExpressInstaller/);
});

test('SQL Database Engine identity receives permission to create backup files for existing and new instances', () => {
  const installer = read('deploy/windows/Install-NIPCO.ps1');
  assert.match(installer, /Get-CimInstance Win32_Service/);
  assert.match(installer, /sqlServiceConfig\.StartName/);
  assert.match(installer, /icacls\.exe \$backupPath \/grant/);
  assert.match(installer, /Granted SQL backup folder access to database engine identity/);
});


test('a failed or conflicting save invalidates stale queued snapshots before SQL reload', () => {
  const store = read('src/lib/store.ts');
  assert.match(store, /let writeGeneration = 0/);
  assert.match(store, /const generation = writeGeneration/);
  assert.match(store, /generation !== writeGeneration/);
  assert.match(store, /writeGeneration\+\+/);
});

test('daily control IDs use the UUID format enforced by the API', () => {
  const store = read('src/lib/store.ts');
  const form = read('src/views/ControlForm.tsx');
  const api = read('server/src/app.js');
  assert.match(form, /id:\s*"dc-"\s*\+\s*uuid\(\)/);
  assert.match(store, /export const uuid =/);
  assert.ok(api.includes('/^dc-[0-9a-f-]{36}$/i'));
});


test('account passwords are excluded from AppState JSON and legacy stored user objects are scrubbed by SQL migration', () => {
  const app = read('server/src/app.js');
  const sanitizer = read('server/src/state-security.js');
  const migration = read('server/sql/004_remove_embedded_user_credentials.sql');
  assert.match(app, /stripUsersFromState/);
  assert.match(sanitizer, /delete safe\.users/);
  assert.match(migration, /JSON_MODIFY\(payload, '\$\.users', NULL\)/);
  assert.match(migration, /revision = revision \+ 1/);
  assert.match(read('deploy/windows/Install-NIPCO.ps1'), /004_remove_embedded_user_credentials\.sql/);
});

test('multi-user verification exercises two sessions, shared reads, and stale-revision rejection', () => {
  const script = read('deploy/windows/Test-MultiUser.ps1');
  assert.match(script, /api\/auth\/login/);
  assert.match(script, /NIPCO-STALE-WRITE-MUST-BE-REJECTED/);
  assert.match(script, /staleStatus -ne 409/);
  assert.match(script, /finally/);
  assert.ok(fs.existsSync(path.join(root, 'deploy/windows/Test-BackupFile.ps1')));
});

test('client certificate installation verifies the requested DNS SAN before trusting the certificate', () => {
  const script = read('deploy/windows/Install-ClientCertificate.ps1');
  assert.match(script, /ExpectedDnsName/);
  assert.match(script, /2\.5\.29\.17/);
  assert.match(script, /cert\.Subject -cne \$cert\.Issuer/);
  assert.match(script, /Cert:\\LocalMachine\\Root/);
});

test('only administrators can edit global settings, and disabled users need a fresh password to reactivate', () => {
  const settings = read('src/views/Settings.tsx');
  const store = read('server/src/sql-store.js');
  assert.match(settings, /const tabs = isAdmin \?/);
  assert.match(settings, /needsNewPassword/);
  assert.match(store, /برای فعال‌سازی حساب غیرفعال، ابتدا رمز عبور جدید تعیین کنید/);
});


test('application SQL principal is restricted to explicit runtime objects, not database-wide reader/writer roles', () => {
  const migration = read('server/sql/005_runtime_least_privilege.sql');
  const installer = read('deploy/windows/Install-NIPCO.ps1');
  assert.match(migration, /ALTER ROLE db_datareader DROP MEMBER nipco_app/);
  assert.match(migration, /ALTER ROLE db_datawriter DROP MEMBER nipco_app/);
  assert.match(migration, /GRANT SELECT, INSERT, UPDATE ON OBJECT::control\.AppState TO nipco_runtime/);
  assert.match(migration, /GRANT SELECT, INSERT, DELETE ON OBJECT::control\.BackupHistory TO nipco_runtime/);
  assert.match(installer, /005_runtime_least_privilege\.sql/);
  assert.doesNotMatch(installer, /ALTER ROLE db_datareader ADD MEMBER/);
  assert.doesNotMatch(installer, /ALTER ROLE db_datawriter ADD MEMBER/);
});


test('Windows service installation configures SQL dependency, auto-start and a bounded startup health wait', () => {
  const installer = read('deploy/windows/Install-NIPCO.ps1');
  assert.match(installer, /Set-Service -Name \$sqlService\.Name -StartupType Automatic/);
  assert.match(installer, /sc\.exe config NIPCOControl depend=/);
  assert.match(installer, /sc\.exe failure NIPCOControl reset=/);
  assert.match(installer, /healthDeadline=\(Get-Date\)\.AddMinutes\(2\)/);
});

test('new users created in UI use bare UUIDs compatible with SQL Server UNIQUEIDENTIFIER', () => {
  const settings = read('src/views/Settings.tsx');
  assert.match(settings, /id:\s*uuid\(\)/);
  assert.doesNotMatch(settings, /id:\s*uid\(\),\s*username:/);
});

test('client store syncs server-stamped audit logs and recovers from transient write blocks', () => {
  const store = read('src/lib/store.ts');
  const api = read('server/src/app.js');
  assert.match(api, /stampedLogs:\s*stampedAdditions/);
  assert.match(store, /applyStampedLogs\(result\.stampedLogs\)/);
  assert.match(store, /if \(writesBlocked\) \{/);
});

test('SQL migration 003 uses dynamic SQL for CHECK constraint on newly added column and restore relinks orphaned nipco_app user', () => {
  const mig003 = read('server/sql/003_app_state_and_users.sql');
  const restore = read('deploy/windows/Restore-Database.ps1');
  assert.match(mig003, /EXEC\(N'ALTER TABLE control\.Users ADD CONSTRAINT CK_control_Users_group_ids_json/);
  assert.match(restore, /ALTER USER \[nipco_app\] WITH LOGIN = \[nipco_app\]/);
});

test('shiftOfTime resolves against configured shifts and defaults to production shift IDs', () => {
  const jalali = read('src/lib/jalali.ts');
  const form = read('src/views/ControlForm.tsx');
  assert.match(jalali, /return "shift-1"/);
  assert.match(form, /shiftOfTime\(nowHM\(\),\s*db\.shifts\)/);
});

test('PowerShell 5.1 scripts include UTF-8 BOM and use dictionary syntax for SqlConnectionStringBuilder', () => {
  const psDir = path.join(root, 'deploy/windows');
  for (const name of fs.readdirSync(psDir).filter((f) => f.endsWith('.ps1'))) {
    const raw = fs.readFileSync(path.join(psDir, name));
    if (raw.some((b) => b >= 0x80)) {
      assert.equal(raw[0] === 0xEF && raw[1] === 0xBB && raw[2] === 0xBF, true, `${name} must start with UTF-8 BOM for PowerShell 5.1`);
    }
    const text = raw.toString('utf8');
    assert.doesNotMatch(text, /Builder\.(DataSource|InitialCatalog|IntegratedSecurity|UserID|ConnectTimeout)\s*=/, `${name} must use SqlConnectionStringBuilder['...'] dictionary keys for PowerShell 5.1`);
  }
});

