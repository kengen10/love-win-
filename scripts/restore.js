// Stop the application before restoring. Refuses to overwrite an existing DB.
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

async function main() {
  const source = process.argv[2];
  if (!source) throw new Error('Usage: npm run restore -- <backup.db>');
  const target = path.resolve(process.env.DB_PATH || 'data/lovewins.db');
  if ([target, `${target}-wal`, `${target}-shm`].some(file => fs.existsSync(file))) {
    throw new Error('Stop the app and move the existing database and its -wal/-shm files to a safe location first.');
  }
  const db = new Database(path.resolve(source), { readonly: true, fileMustExist: true });
  try {
    if (db.pragma('integrity_check', { simple: true }) !== 'ok') throw new Error('Backup integrity check failed.');
    fs.mkdirSync(path.dirname(target), { recursive: true });
    await db.backup(target);
    fs.chmodSync(target, 0o600);
    console.log(`Database restored: ${target}`);
  } finally { db.close(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
