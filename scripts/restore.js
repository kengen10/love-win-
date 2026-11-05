// Restore a JSON backup produced by scripts/backup.js.
// Refuses to replace existing data unless --force is passed.
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const db = require('../src/db');

async function main() {
  const source = process.argv[2];
  if (!source) throw new Error('Usage: npm run restore -- <backup.json> [--force]');
  const force = process.argv.includes('--force');
  const dump = JSON.parse(fs.readFileSync(path.resolve(source), 'utf8'));
  const collections = dump.collections || {};
  const mongo = await db.connect();

  if (!force) {
    for (const name of Object.keys(collections)) {
      if (await mongo.collection(name).countDocuments({})) {
        throw new Error(`Collection "${name}" already has data. Re-run with --force to replace it.`);
      }
    }
  }

  for (const [name, docs] of Object.entries(collections)) {
    const collection = mongo.collection(name);
    await collection.deleteMany({});
    if (docs.length) await collection.insertMany(docs);
    console.log(`${name}: ${docs.length} document(s) restored`);
  }
  console.log(`Database "${dump.database || mongo.databaseName}" restored from ${source}`);
}

main()
  .catch((error) => { console.error(error.message); process.exitCode = 1; })
  .finally(() => db.close());
