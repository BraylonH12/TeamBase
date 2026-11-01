const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '../..');
const databaseDir = path.resolve(ROOT, 'data', 'pgdata');

fs.rmSync(databaseDir, { recursive: true, force: true });
console.log('Removed the embedded database at data/pgdata.');
