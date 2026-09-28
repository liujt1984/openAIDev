// Read-only checks against the configured real cloud environment.
const automator = require('miniprogram-automator');
const assert = require('node:assert/strict');
async function main() {
  const mini = await automator.connect({ wsEndpoint: process.env.WECHAT_AUTOMATOR_ENDPOINT || 'ws://127.0.0.1:9420' });
  try {
    const home = await mini.switchTab('/pages/home/home');
    assert.equal(await home.data('demo'), false, '当前仍是本地演示模式，不能算作云端联调');
    for (const action of ['health', 'profile', 'list', 'mine']) {
      const response = await mini.evaluate(async operation => wx.cloud.callFunction({ name: 'carpool', data: { action: operation, data: {} } }), action);
      assert.ok(response && response.result && response.result.ok, response && response.result ? response.result.message : '云函数没有返回结果');
      console.log('PASS cloud action:', action);
    }
    await home.callMethod('load');
    assert.equal(await home.data('error'), '');
    console.log('Cloud read-only smoke passed. No data was created or changed.');
  } finally { mini.disconnect(); }
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
