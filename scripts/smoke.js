// Run after opening this project with `cli auto --auto-port 9420 --trust-project`.
// This is read-only: it does not reset demo data or send real applications.
const automator = require('miniprogram-automator');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
async function main() {
  const mini = await automator.connect({ wsEndpoint: process.env.WECHAT_AUTOMATOR_ENDPOINT || 'ws://127.0.0.1:9420' });
  const errors = [];
  mini.on('exception', e => errors.push(e));
  try {
    const dir = path.resolve(__dirname, '../artifacts'); fs.mkdirSync(dir, { recursive: true });
    for (const name of ['home', 'publish', 'journeys', 'profile']) {
      const page = await mini.switchTab('/pages/' + name + '/' + name);
      await page.waitFor(800);
      const data = await page.data(); assert.ok(!data.error, data.error);
      await mini.screenshot({ path: path.join(dir, name + '.png') });
      console.log('PASS page:', page.path);
    }
    await mini.switchTab('/pages/home/home');
    assert.equal(errors.length, 0, JSON.stringify(errors));
    console.log('Smoke passed. Screenshots: artifacts/');
  } finally { mini.disconnect(); }
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
