// Usage: npm run create-admin -- <username> <password>   (re-run to reset a password)
require('dotenv').config();
const bcrypt = require('bcryptjs');
const db = require('../src/db');
const [u, p] = process.argv.slice(2);
if (!u || !p || p.length < 12) { console.error('Usage: npm run create-admin -- <username> <password of 12+ characters>'); process.exit(1); }

(async () => {
  const admins = await db.get('admins');
  const password_hash = bcrypt.hashSync(p, 12);
  if (await admins.findOne({ username: u }, { projection: { _id: 1 } })) {
    await admins.updateOne({ username: u }, { $set: { password_hash } });
  } else {
    await db.insert('admins', { username: u, password_hash });
  }
  console.log(`Admin "${u}" saved.`);
})().catch((error) => { console.error(error.message); process.exitCode = 1; }).finally(() => db.close());
