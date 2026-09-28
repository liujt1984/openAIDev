const config = require('../config');
const { execute } = require('../core/domain');
const { seed } = require('../core/seed');
const STORE = 'wuming_carpool_v1', USER = 'wuming_demo_user';
let queue = Promise.resolve();
function userId() { return wx.getStorageSync(USER) || 'parent'; }
function call(action, data = {}) {
  // Tests and local source checks do not expose wx.cloud; safely use the local adapter there.
  const cloudActive = config.mode === 'cloud' && wx.cloud && wx.cloud.callFunction;
  const actorId = cloudActive ? '' : userId();
  if (cloudActive) {
    return wx.cloud.callFunction({ name: 'carpool', data: { action, data } }).then(({ result }) => {
      if (!result || !result.ok) throw new Error(result ? result.message : '服务暂时不可用');
      return result.data;
    });
  }
  const run = async () => {
    const state = JSON.parse(JSON.stringify(wx.getStorageSync(STORE) || seed()));
    const repo = {
      get: async (table, id) => state[table][id] ? JSON.parse(JSON.stringify(state[table][id])) : null,
      list: async table => Object.values(state[table]),
      put: async (table, id, doc) => { state[table][id] = doc; }
    };
    const result = await execute(repo, actorId, action, data);
    wx.setStorageSync(STORE, state); return result;
  };
  const promise = queue.then(run, run); queue = promise.catch(() => {}); return promise;
}
function switchUser(id) { wx.setStorageSync(USER, id); }
function reset() { wx.removeStorageSync(STORE); wx.removeStorageSync(USER); }
function error(e) { wx.showToast({ title: e.message || '操作失败，请重试', icon: 'none', duration: 3500 }); }
function confirm(content, title = '请确认') { return new Promise(resolve => wx.showModal({ title, content, success: res => resolve(res.confirm), fail: () => resolve(false) })); }
function prompt(title, placeholderText) { return new Promise(resolve => wx.showModal({ title, editable: true, placeholderText, success: r => resolve(r.confirm ? (r.content || '').trim() : null), fail: () => resolve(null) })); }
module.exports = { call, userId, switchUser, reset, error, confirm, prompt, demo: config.mode === 'demo' };
