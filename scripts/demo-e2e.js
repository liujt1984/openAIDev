// Executes ONLY against demo storage. Original local demo data is restored in finally.
const automator = require('miniprogram-automator');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
async function main() {
  const mini = await automator.connect({ wsEndpoint: process.env.WECHAT_AUTOMATOR_ENDPOINT || 'ws://127.0.0.1:9420' });
  let snapshot;
  const errors = [];
  mini.on('exception', e => errors.push(e));
  async function detailAs(index) {
    const profile = await mini.switchTab('/pages/profile/profile');
    await profile.callMethod('switchUser', { detail: { value: String(index) } });
    await profile.callMethod('load');
    const detail = await mini.navigateTo('/pages/detail/detail?id=t1');
    await detail.callMethod('load');
    assert.equal(await detail.data('error'), '');
    return detail;
  }
  async function act(page, action, payload) {
    await page.callMethod('act', action, payload);
    const trip = await page.data('trip');
    assert.ok(trip); return trip;
  }
  try {
    const home = await mini.switchTab('/pages/home/home');
    assert.equal(await home.data('demo'), true, 'Refusing to mutate a cloud environment');
    snapshot = await mini.evaluate(() => ({ state: wx.getStorageSync('wuming_carpool_v1'), user: wx.getStorageSync('wuming_demo_user') }));
    await mini.evaluate(() => { wx.removeStorageSync('wuming_carpool_v1'); wx.removeStorageSync('wuming_demo_user'); });
    let page = await detailAs(0);
    let trip = await act(page, 'apply', { studentId: 's1' }); const applicationId = trip.applications[0].id;
    assert.equal(trip.applications[0].status, 'pending'); console.log('PASS apply');
    page = await detailAs(1); trip = await act(page, 'accept', { applicationId }); assert.equal(trip.remaining, 1); console.log('PASS accept and reserve seat');
    page = await detailAs(0); trip = await act(page, 'inform', { applicationId, method: '自动化演示：入校前交付接送确认单' }); assert.equal(trip.applications[0].informed, true); console.log('PASS student informed');
    const dir = path.resolve(__dirname, '../artifacts'); fs.mkdirSync(dir, { recursive: true });
    await mini.screenshot({ path: path.join(dir, 'confirmed-trip.png') });
    page = await detailAs(1);
    for (const status of ['boarded', 'arrived', 'handed']) { trip = await act(page, 'progress', { applicationId, status, note: '自动化演示：已交给学生母亲' }); assert.equal(trip.applications[0].status, status); }
    console.log('PASS boarding, arrival and handover');
    trip = await act(page, 'createBill', { actualKm: 65, tollFen: 0 }); assert.equal(trip.bill.shares[0].amountFen, 1733); console.log('PASS AA bill ¥17.33');
    page = await detailAs(0); await act(page, 'confirmBill', { applicationId }); trip = await act(page, 'markPaid', { applicationId }); assert.equal(trip.bill.shares[0].parentPaid, true);
    page = await detailAs(1); trip = await act(page, 'markPaid', { applicationId }); assert.equal(trip.bill.shares[0].settled, true); console.log('PASS bilateral offline settlement');
    assert.equal(errors.length, 0, JSON.stringify(errors));
    console.log('Demo E2E passed; original demo storage will be restored.');
  } finally {
    if (snapshot) await mini.evaluate(value => { if (value.state) wx.setStorageSync('wuming_carpool_v1', value.state); else wx.removeStorageSync('wuming_carpool_v1'); if (value.user) wx.setStorageSync('wuming_demo_user', value.user); else wx.removeStorageSync('wuming_demo_user'); }, snapshot);
    await mini.switchTab('/pages/home/home');
    mini.disconnect();
  }
}
main().catch(e => { console.error(e.stack || e.message); process.exitCode = 1; });
