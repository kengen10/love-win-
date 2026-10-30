require('dotenv').config();
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

async function main() {
  const source = path.resolve(process.env.DB_PATH || 'data/lovewins.db');
  if (!fs.existsSync(source)) throw new Error(`Database does not exist: ${source}`);
  const dir = path.resolve(process.env.BACKUP_DIR || 'backups');
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const target = path.join(dir, `lovewins-${stamp}.db`);
  const db = new Database(source, { readonly: true, fileMustExist: true });
  try {
    await db.backup(target);
    fs.chmodSync(target, 0o600);
    console.log(`Backup saved: ${target}`);
  } finally { db.close(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
