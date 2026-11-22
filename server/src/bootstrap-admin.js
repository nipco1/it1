// INITIAL ADMIN PROVISIONING — foundation only; not a production installer.
// SQL credentials are provided by the service environment; the password for the
// new admin is only entered interactively and is never accepted in arguments.
import sql from 'mssql';
import argon2 from 'argon2';
import readline from 'node:readline/promises';
import { loadConfig, loadEnvFile } from './config.js';
loadEnvFile();

function secret(prompt) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error('Interactive terminal required');
  process.stdout.write(prompt);
  return new Promise((resolve, reject) => {
    const input = process.stdin;
    let text = '';
    input.setEncoding('utf8');
    input.setRawMode(true);
    input.resume();
    function finish(err) {
      input.removeListener('data', onData);
      input.setRawMode(false); input.pause(); process.stdout.write('\n');
      if (err) reject(err); else resolve(text);
    }
    function onData(chunk) {
      for (const ch of chunk) {
        if (ch === '\u0003') return finish(new Error('Cancelled'));
        if (ch === '\r' || ch === '\n') return finish();
        if (ch === '\u007f' || ch === '\b') { text = [...text].slice(0, -1).join(''); continue; }
        if (ch >= ' ' && text.length < 512) text += ch;
      }
    }
    input.on('data', onData);
  });
}

async function main() {
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error('Interactive terminal required');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  let username, displayName;
  try {
    username = (await rl.question('نام کاربری مدیر: ')).trim().toLowerCase();
    displayName = (await rl.question('نام نمایشی مدیر: ')).trim();
  } finally { rl.close(); }
  if (!/^[A-Za-z0-9._@-]{3,128}$/.test(username) || !displayName || displayName.length > 200) throw new Error('نام کاربری باید ۳ تا ۱۲۸ نویسه و فقط شامل حروف انگلیسی، عدد و . _ @ - باشد.');
  const password = await secret('رمز مدیر (حداقل ۱۴ نویسه؛ نمایش داده نمی‌شود): ');
  const confirm = await secret('تکرار رمز: ');
  if ([...password].length < 14 || !/[A-Za-z]/.test(password) || !/\d/.test(password) || password !== confirm) throw new Error('رمز باید حداقل ۱۴ نویسه و شامل حرف و عدد باشد و با تکرار آن یکسان باشد.');
  const hash = await argon2.hash(password, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });
  const pool = await sql.connect(loadConfig());
  const transaction = new sql.Transaction(pool);
  try {
    await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    const request = new sql.Request(transaction);
    const result = await request.query('SELECT COUNT_BIG(*) AS n FROM control.Users WITH (UPDLOCK, HOLDLOCK)');
    if (Number(result.recordset[0].n) !== 0) throw new Error('Database already contains users; refusing bootstrap');
    await new sql.Request(transaction).input('username', sql.NVarChar(128), username)
      .input('name', sql.NVarChar(200), displayName).input('hash', sql.NVarChar(512), hash)
      .query("INSERT INTO control.Users (username, display_name, role, password_hash, group_ids) VALUES (@username, @name, 'admin', @hash, N'\"all\"')");
    await transaction.commit();
    console.log('حساب مدیر اولیه با موفقیت ایجاد شد. رمز عبور به صورت Argon2id ذخیره شده است.');
  } catch (err) {
    try { await transaction.rollback(); } catch { /* No active transaction. */ }
    throw err;
  } finally { await pool.close(); }
}
main().catch(err => { console.error('Bootstrap failed:', err.message); process.exitCode = 1; });
