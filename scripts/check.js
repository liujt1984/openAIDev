const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const files = [];
function walk(dir) { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { if (['node_modules', '.git', 'artifacts'].includes(e.name)) continue; const p = path.join(dir, e.name); if (e.isDirectory()) walk(p); else files.push(p); } }
walk(root);
let count = 0;
for (const file of files) {
  if (file.endsWith('.js')) { new vm.Script(fs.readFileSync(file, 'utf8'), { filename: file }); count++; }
  if (file.endsWith('.json')) { JSON.parse(fs.readFileSync(file, 'utf8')); count++; }
}
const app = JSON.parse(fs.readFileSync(path.join(root, 'miniprogram/app.json'), 'utf8'));
for (const page of app.pages) {
  for (const ext of ['.js', '.json', '.wxml']) if (!fs.existsSync(path.join(root, 'miniprogram', page + ext))) throw new Error('Missing page file: ' + page + ext);
  const js = fs.readFileSync(path.join(root, 'miniprogram', page + '.js'), 'utf8');
  const wxml = fs.readFileSync(path.join(root, 'miniprogram', page + '.wxml'), 'utf8');
  for (const match of wxml.matchAll(/(?:bind|catch)(?:tap|input|change|submit)="(\w+)"/g)) if (!new RegExp('\\b' + match[1] + '\\s*\\(').test(js)) throw new Error('Missing handler ' + page + ':' + match[1]);
}
if (fs.readFileSync(path.join(root, 'miniprogram/core/domain.js'), 'utf8') !== fs.readFileSync(path.join(root, 'cloudfunctions/carpool/domain.js'), 'utf8')) throw new Error('Run npm run sync:cloud before deployment.');
const compilerRoot = process.env.WECHAT_COMPILER_DIR || 'C:\\Program Files (x86)\\Tencent\\微信web开发者工具\\resources\\app.asar.unpacked\\node_modules\\wcc-exec';
if (!process.argv.includes('--skip-native') && fs.existsSync(path.join(compilerRoot, 'wcc.exe'))) {
  const templates = app.pages.map(p => p + '.wxml');
  cp.execFileSync(path.join(compilerRoot, 'wcc.exe'), templates, { cwd: path.join(root, 'miniprogram'), stdio: 'pipe' });
  cp.execFileSync(path.join(compilerRoot, 'wcsc.exe'), ['app.wxss'], { cwd: path.join(root, 'miniprogram'), stdio: 'pipe' });
  console.log('WeChat native compiler: 5 WXML pages and global WXSS passed.');
} else console.log('WXML/WXSS native compilation skipped (explicit flag or compiler not installed).');
console.log('Syntax/config checks passed (' + count + ' files), routes and UI event handlers verified.');
