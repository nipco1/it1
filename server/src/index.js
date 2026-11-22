import fs from 'node:fs';
import https from 'node:https';
import path from 'node:path';
import argon2 from 'argon2';
import sql from 'mssql';
import { APP_ROOT, loadConfig, loadEnvFile } from './config.js';
import { createApp } from './app.js';
import { createSqlStore } from './sql-store.js';

loadEnvFile();
for (const name of ['PUBLIC_ORIGIN','TLS_PFX_PATH','TLS_PFX_PASSWORD']) if (!process.env[name]) throw new Error(`Missing required configuration: ${name}`);
const port = Number(process.env.PORT || 8443);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT');
const pfxPath = path.resolve(APP_ROOT, process.env.TLS_PFX_PATH);
if (!fs.existsSync(pfxPath)) throw new Error(`TLS certificate not found: ${pfxPath}`);
const pool = await sql.connect(loadConfig());
const backupDir = path.join(APP_ROOT, 'Backups');
const dummyHash = await argon2.hash('dummy-password-not-used-' + process.pid, { type: argon2.argon2id });
const app = createApp({
  store: createSqlStore(pool, sql, backupDir),
  verifyPassword: argon2.verify,
  hashPassword: password => argon2.hash(password, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 }),
  dummyHash,
  publicOrigin: process.env.PUBLIC_ORIGIN,
  staticRoot: path.join(APP_ROOT, 'dist'),
  backupDir,
});
const server = https.createServer({ pfx: fs.readFileSync(pfxPath), passphrase: process.env.TLS_PFX_PASSWORD }, app);
server.listen(port, process.env.BIND_ADDRESS || '127.0.0.1', () => console.log(`NIPCO Control listening at ${process.env.PUBLIC_ORIGIN}`));
async function shutdown() {
  await new Promise(resolve => server.close(resolve));
  await pool.close();
}
process.once('SIGINT', () => shutdown().catch(() => process.exit(1)));
process.once('SIGTERM', () => shutdown().catch(() => process.exit(1)));
