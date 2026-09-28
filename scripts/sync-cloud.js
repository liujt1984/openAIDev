const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
fs.copyFileSync(path.join(root, 'miniprogram/core/domain.js'), path.join(root, 'cloudfunctions/carpool/domain.js'));
console.log('Cloud domain synchronized.');
