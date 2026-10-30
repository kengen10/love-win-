const path = require('path');
module.exports = { apps: [{ name: 'love-wins', cwd: path.resolve(__dirname, '..'), script: 'server.js', env: { NODE_ENV: 'production' }, max_memory_restart: '300M' }] };
