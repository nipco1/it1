import fs from 'node:fs';
import path from 'node:path';
import sql from 'mssql';

const ROLE_SET = new Set(['admin', 'supervisor', 'engineer', 'technician', 'viewer']);
const normalizeGroupJson = value => {
  if (value === 'all' || value === '"all"') return '"all"';
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value || '[]') : value;
    return parsed === 'all' ? '"all"' : JSON.stringify(Array.isArray(parsed) ? parsed : []);
  } catch {
    return '[]';
  }
};
const cleanUser = row => ({
  id: row.id,
  username: row.username,
  name: row.name,
  role: row.role,
  active: !!row.active,
  groupIds: row.groupIds === 'all' ? 'all' : JSON.parse(row.groupIds || '[]'),
});
const isStrongPassword = value => typeof value === 'string' && [...value].length >= 14 && /[A-Za-z]/.test(value) && /\d/.test(value);

async function writeUsers(transaction, driver, users, hashPassword) {
  if (!Array.isArray(users) || users.length < 1 || users.length > 1000) throw new Error('Invalid user collection');
  const activeAdmins = users.filter(user => user?.role === 'admin' && user.active === true);
  if (activeAdmins.length < 1) throw new Error('At least one active system administrator must remain');

  const existingResult = await new driver.Request(transaction).query('SELECT id, username, role, active, group_ids AS groupIds FROM control.Users WITH (UPDLOCK,HOLDLOCK)');
  const existing = new Map(existingResult.recordset.map(row => [String(row.id).toLowerCase(), row]));
  const seenIds = new Set();
  const seenNames = new Set();

  for (const raw of users) {
    if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(raw.id) ||
      typeof raw.username !== 'string' || typeof raw.name !== 'string' || !ROLE_SET.has(raw.role) ||
      typeof raw.active !== 'boolean' ||
      !(raw.groupIds === 'all' || (Array.isArray(raw.groupIds) && raw.groupIds.length <= 100 &&
        raw.groupIds.every(value => typeof value === 'string' && value.length > 0 && value.length <= 100) &&
        new Set(raw.groupIds).size === raw.groupIds.length))) {
      throw new Error('Invalid user record');
    }

    const id = raw.id.toLowerCase();
    const username = raw.username.trim().toLowerCase();
    const name = raw.name.trim();
    if (!/^[A-Za-z0-9._@-]{3,128}$/.test(username) || !name || name.length > 200 || seenIds.has(id) || seenNames.has(username.toLowerCase())) {
      throw new Error('Duplicate or invalid user identity');
    }
    seenIds.add(id);
    seenNames.add(username.toLowerCase());

    const previous = existing.get(id);
    const groupJson = raw.groupIds === 'all' ? '"all"' : JSON.stringify(raw.groupIds);
    if (previous && !previous.active && raw.active && !(typeof raw.pass === 'string' && raw.pass.length)) {
      throw new Error('برای فعال‌سازی حساب غیرفعال، ابتدا رمز عبور جدید تعیین کنید.');
    }
    if (!previous) {
      if (!isStrongPassword(raw.pass)) throw new Error('New users need a password of at least 14 characters containing letters and numbers');
      const passwordHash = await hashPassword(raw.pass);
      await new driver.Request(transaction)
        .input('id', driver.UniqueIdentifier, raw.id)
        .input('username', driver.NVarChar(128), username)
        .input('name', driver.NVarChar(200), name)
        .input('role', driver.VarChar(20), raw.role)
        .input('active', driver.Bit, raw.active)
        .input('groups', driver.NVarChar(driver.MAX), groupJson)
        .input('hash', driver.NVarChar(512), passwordHash)
        .query(`INSERT INTO control.Users(id,username,display_name,role,active,group_ids,password_hash)
                VALUES(@id,@username,@name,@role,@active,@groups,@hash)`);
      continue;
    }

    const request = new driver.Request(transaction)
      .input('id', driver.UniqueIdentifier, raw.id)
      .input('username', driver.NVarChar(128), username)
      .input('name', driver.NVarChar(200), name)
      .input('role', driver.VarChar(20), raw.role)
      .input('active', driver.Bit, raw.active)
      .input('groups', driver.NVarChar(driver.MAX), groupJson);
    let passwordChanged = false;
    if (typeof raw.pass === 'string' && raw.pass.length) {
      if (!isStrongPassword(raw.pass)) throw new Error('Password must contain at least 14 characters, including letters and numbers');
      request.input('hash', driver.NVarChar(512), await hashPassword(raw.pass));
      passwordChanged = true;
      await request.query(`UPDATE control.Users SET username=@username,display_name=@name,role=@role,active=@active,group_ids=@groups,password_hash=@hash WHERE id=@id`);
    } else {
      await request.query(`UPDATE control.Users SET username=@username,display_name=@name,role=@role,active=@active,group_ids=@groups WHERE id=@id`);
    }
    const priorGroups = normalizeGroupJson(previous.groupIds);
    const nextGroups = normalizeGroupJson(groupJson);
    const identityChanged = String(previous.username).toLowerCase() !== username || previous.role !== raw.role || !!previous.active !== raw.active || priorGroups !== nextGroups || passwordChanged;
    if (identityChanged) await new driver.Request(transaction).input('id', driver.UniqueIdentifier, raw.id).query('DELETE FROM control.Sessions WHERE user_id=@id');
  }

  // Preserve audit and foreign-key history; absence from the submitted list deactivates an account.
  for (const [id] of existing) {
    if (!seenIds.has(id)) {
      await new driver.Request(transaction).input('id', driver.UniqueIdentifier, id)
        .query('UPDATE control.Users SET active=0 WHERE id=@id; DELETE FROM control.Sessions WHERE user_id=@id;');
    }
  }
}

export function createSqlStore(pool, driver = sql, backupDir = null) {
  return {
    async findUser(username) {
      const result = await pool.request().input('username', driver.NVarChar(128), String(username).trim().toLowerCase()).query(`
        SELECT id, username, display_name AS name, role, active, password_hash AS passwordHash,
               group_ids AS groupIds
        FROM control.Users WHERE username = @username`);
      return result.recordset[0] ? { ...cleanUser(result.recordset[0]), passwordHash: result.recordset[0].passwordHash } : null;
    },
    async listUsers() {
      const result = await pool.request().query(`SELECT id, username, display_name AS name, role, active, group_ids AS groupIds FROM control.Users ORDER BY display_name, username`);
      return result.recordset.map(cleanUser);
    },
    async createSession(tokenHash, userId, expiresAt) {
      await pool.request().query('DELETE FROM control.Sessions WHERE expires_at <= SYSUTCDATETIME()');
      await pool.request().input('hash', driver.Char(64), tokenHash).input('userId', driver.UniqueIdentifier, userId)
        .input('expires', driver.DateTime2, expiresAt).query(`
          INSERT INTO control.Sessions (token_hash, user_id, expires_at) VALUES (@hash, @userId, @expires)`);
    },
    async findSession(tokenHash) {
      const result = await pool.request().input('hash', driver.Char(64), tokenHash).query(`
        SELECT u.id, u.username, u.display_name AS name, u.role, u.active, u.group_ids AS groupIds
        FROM control.Sessions s JOIN control.Users u ON u.id = s.user_id
        WHERE s.token_hash = @hash AND s.expires_at > SYSUTCDATETIME() AND u.active = 1`);
      return result.recordset[0] ? cleanUser(result.recordset[0]) : null;
    },
    async deleteSession(tokenHash) {
      await pool.request().input('hash', driver.Char(64), tokenHash).query('DELETE FROM control.Sessions WHERE token_hash = @hash');
    },
    async loadAppState() {
      const result = await pool.request().query('SELECT revision, payload FROM control.AppState WHERE id=1');
      if (!result.recordset.length) return { revision: 0, state: null };
      return { revision: Number(result.recordset[0].revision), state: JSON.parse(result.recordset[0].payload) };
    },
    async loadRevision() {
      const result = await pool.request().query('SELECT revision FROM control.AppState WHERE id=1');
      return result.recordset.length ? Number(result.recordset[0].revision) : 0;
    },
    async createBackup(createdBy = null) {
      if (!backupDir) throw new Error('Backup directory is not configured');
      fs.mkdirSync(backupDir, { recursive: true });
      const dbResult = await pool.request().query('SELECT DB_NAME() AS databaseName');
      const databaseName = dbResult.recordset[0].databaseName;
      const safeName = String(databaseName).replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 80);
      const fileName = `${safeName}_${new Date().toISOString().replace(/[:.]/g, '-')}.bak`;
      const filePath = path.join(backupDir, fileName);
      const quotedPath = `N'${filePath.replace(/'/g, "''")}'`;
      const quotedDb = `[${String(databaseName).replace(/]/g, ']]')}]`;
      await pool.request().query(`BACKUP DATABASE ${quotedDb} TO DISK = ${quotedPath} WITH INIT, CHECKSUM;`);
      const stat = fs.statSync(filePath);
      await pool.request().input('file', driver.NVarChar(260), fileName).input('size', driver.BigInt, stat.size)
        .input('createdBy', driver.UniqueIdentifier, createdBy).query(`INSERT INTO control.BackupHistory(file_name,file_size,backup_type,created_by,verified) VALUES(@file,@size,'FULL',@createdBy,0)`);
      return { fileName, size: stat.size, createdAt: new Date().toISOString(), verified: false };
    },
    async listBackups() {
      const result = await pool.request().query(`SELECT TOP 100 file_name AS fileName,file_size AS size,backup_type AS backupType,created_at AS createdAt,verified FROM control.BackupHistory ORDER BY created_at DESC`);
      return result.recordset.map(row => ({ ...row, verified: !!row.verified }));
    },
    async saveAppState(expectedRevision, payload, userId, userChanges = null, hashPassword = null) {
      const json = JSON.stringify(payload);
      if (json.length > 100 * 1024 * 1024) throw new Error('Application data exceeds the 100 MB safety limit');
      const transaction = new driver.Transaction(pool);
      await transaction.begin(driver.ISOLATION_LEVEL.SERIALIZABLE);
      try {
        const current = await new driver.Request(transaction).query('SELECT revision FROM control.AppState WITH (UPDLOCK,HOLDLOCK) WHERE id=1');
        const revision = current.recordset.length ? Number(current.recordset[0].revision) : 0;
        if (revision !== expectedRevision) {
          await transaction.rollback();
          return { kind: 'conflict', revision };
        }

        // User and application-state changes commit together; a revision conflict cannot partially change accounts.
        if (userChanges !== null) await writeUsers(transaction, driver, userChanges, hashPassword);

        if (revision === 0) {
          await new driver.Request(transaction).input('payload', driver.NVarChar(driver.MAX), json)
            .input('user', driver.UniqueIdentifier, userId)
            .query('INSERT INTO control.AppState(id,revision,payload,updated_by) VALUES(1,1,@payload,@user)');
        } else {
          await new driver.Request(transaction).input('payload', driver.NVarChar(driver.MAX), json)
            .input('user', driver.UniqueIdentifier, userId)
            .query('UPDATE control.AppState SET revision=revision+1,payload=@payload,updated_by=@user,updated_at=SYSUTCDATETIME() WHERE id=1');
        }
        await transaction.commit();
        const users = userChanges !== null ? await this.listUsers() : undefined;
        return { kind: 'saved', revision: revision + 1, users };
      } catch (error) {
        try { await transaction.rollback(); } catch { /* transaction already closed */ }
        throw error;
      }
    },
  };
}
