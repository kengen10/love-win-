// Usage: npm run create-admin -- <username> <password>   (re-run to reset a password)
require('dotenv').config();
const bcrypt = require('bcryptjs');
const db = require('../src/db');
const [u, p] = process.argv.slice(2);
if (!u || !p || p.length < 12) { console.error('Usage: npm run create-admin -- <username> <password of 12+ characters>'); process.exit(1); }
const hash = bcrypt.hashSync(p, 12);
db.prepare('INSERT INTO admins(username,password_hash) VALUES(?,?) ON CONFLICT(username) DO UPDATE SET password_hash=excluded.password_hash').run(u, hash);
console.log(`Admin "${u}" saved.`);
