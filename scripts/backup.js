// Dump every collection to a timestamped JSON file.
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const db = require('../src/db');

const COLLECTIONS = ['admins', 'donations', 'messages', 'reports', 'stories', 'subscribers', 'counters'];

async function main() {
  const mongo = await db.connect();
  const dump = { taken_at: db.now(), database: mongo.databaseName, collections: {} };
  for (const name of COLLECTIONS) {
    dump.collections[name] = await mongo.collection(name).find({}).sort({ id: 1 }).toArray();
  }
  const dir = path.resolve(process.env.BACKUP_DIR || 'backups');
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const target = path.join(dir, `lovewins-${stamp}.json`);
  fs.writeFileSync(target, JSON.stringify(dump, null, 2), { mode: 0o600 });
  console.log(`Backup saved: ${target}`);
}

main()
  .catch((error) => { console.error(error.message); process.exitCode = 1; })
  .finally(() => db.close());
