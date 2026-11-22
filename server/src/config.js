import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SERVER_DIR = path.dirname(fileURLToPath(import.meta.url));
export const APP_ROOT = path.resolve(SERVER_DIR, '..', '..');
export function loadEnvFile(file = path.join(APP_ROOT, '.env'), env = process.env) {
  if (!fs.existsSync(file)) return env;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const at = trimmed.indexOf('='); if (at < 1) continue;
    const key = trimmed.slice(0, at).trim();
    let value = trimmed.slice(at + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (env[key] === undefined) env[key] = value;
  }
  return env;
}
export function loadConfig(env = process.env) {
  for (const name of ['SQL_HOST', 'SQL_DATABASE', 'SQL_USER', 'SQL_PASSWORD']) {
    if (!env[name]) throw new Error(`Missing required configuration: ${name}`);
  }
  const port = Number(env.SQL_PORT || 1433);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid SQL_PORT');
  return {
    server: env.SQL_HOST, port, database: env.SQL_DATABASE,
    user: env.SQL_USER, password: env.SQL_PASSWORD,
    options: { encrypt: true, trustServerCertificate: env.SQL_TRUST_CERT === 'true', enableArithAbort: true },
    pool: { max: 20, min: 0, idleTimeoutMillis: 30000 },
    connectionTimeout: 30000, requestTimeout: 60000,
  };
}
