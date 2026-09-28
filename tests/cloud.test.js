const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const domain = require('../cloudfunctions/carpool/domain');
function cloudHarness(options = {}) {
  const state = { profiles: {}, trips: {}, needs: {}, reports: {} };
  const clone = x => JSON.parse(JSON.stringify(x));
  let transactions = 0;
  function handle(data) {
    return { collection(table) {
      return {
        doc(id) { return {
          async get() { if (options.missingCollection === table) throw new Error('collection ' + table + ' does not exist'); if (!data[table][id]) throw new Error('document with _id ' + id + ' does not exist'); return { data: clone(data[table][id]) }; },
          async set({ data: value }) { data[table][id] = clone(value); }
        }; },
        limit() { return { async get() { if (options.missingCollection === table) throw new Error('collection ' + table + ' does not exist'); return { data: [] }; } }; }
      };
    } };
  }
  const db = Object.assign(handle(state), { async runTransaction(fn) { transactions++; const working = clone(state); const result = await fn(handle(working)); Object.assign(state, working); return result; } });
  const sdk = { init() {}, DYNAMIC_CURRENT_ENV: 'test-environment', database: () => db, getWXContext: () => ({ OPENID: options.anonymous ? '' : 'real-openid' }) };
  const exports = {};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../cloudfunctions/carpool/index.js'), 'utf8'), { exports, require: name => name === 'wx-server-sdk' ? sdk : domain, console: { error() {} } });
  return { main: exports.main, state, transactions: () => transactions };
}
test('cloud entry rejects missing authenticated OPENID even when event supplies an identity', async () => {
  const h = cloudHarness({ anonymous: true }); const r = await h.main({ action: 'profile', OPENID: 'forged', data: { userId: 'forged' } }); assert.equal(r.ok, false); assert.equal(h.transactions(), 0);
});
test('cloud profile treats a missing document as a new account without masking missing collection', async () => {
  const h = cloudHarness(); const r = await h.main({ action: 'profile' }); assert.equal(r.ok, true); assert.equal(r.data.id, 'real-openid');
  const broken = cloudHarness({ missingCollection: 'profiles' }); assert.equal((await broken.main({ action: 'profile' })).ok, false);
});
test('cloud save uses authenticated identity inside transaction and ignores forged user fields', async () => {
  const h = cloudHarness(); const r = await h.main({ action: 'saveProfile', data: { id: 'forged', userId: 'forged', name: '联调家长', phone: '13800000000', students: [], verified: true } });
  assert.equal(r.ok, true); assert.equal(h.transactions(), 1); assert.equal(h.state.profiles['real-openid'].verified, false); assert.equal(h.state.profiles.forged, undefined);
});
test('cloud health checks all collections without mutating user data', async () => {
  const h = cloudHarness(); const r = await h.main({ action: 'health' }); assert.equal(r.ok, true); assert.equal(Object.keys(r.data.collections).length, 4); assert.equal(h.transactions(), 0); assert.deepEqual(h.state.profiles, {});
  const broken = cloudHarness({ missingCollection: 'reports' }); assert.equal((await broken.main({ action: 'health' })).ok, false);
});
