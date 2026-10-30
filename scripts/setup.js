// Create local configuration without overwriting existing settings.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const root = path.resolve(__dirname, '..');
const target = path.join(root, '.env');
if (fs.existsSync(target)) {
  console.log('.env already exists; left unchanged.');
} else {
  const template = fs.readFileSync(path.join(root, '.env.example'), 'utf8');
  fs.writeFileSync(target, template.replace(/^JWT_SECRET=.*$/m,
    `JWT_SECRET=${crypto.randomBytes(48).toString('hex')}`), { flag: 'wx', mode: 0o600 });
  console.log('Created .env with a random session secret.');
}
