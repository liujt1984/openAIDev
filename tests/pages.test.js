const { test } = require('node:test');
const assert = require('node:assert/strict');
const api = require('../miniprogram/services/api');
const { dateAfter } = require('../miniprogram/core/seed');
function setup() {
  const storage = {}, notices = [], routes = [];
  global.wx = {
    getStorageSync: key => storage[key], setStorageSync: (key, value) => { storage[key] = JSON.parse(JSON.stringify(value)); }, removeStorageSync: key => { delete storage[key]; },
    showToast: value => notices.push(value.title), showModal: opts => opts.success({ confirm: true, content: '已与家长沟通确认' }),
    switchTab: opts => routes.push(opts.url), navigateTo: opts => routes.push(opts.url), redirectTo: opts => routes.push(opts.url), stopPullDownRefresh() {}, setClipboardData: opts => { storage.clipboard = opts.data; }
  };
  return { storage, notices, routes };
}
function page(name) {
  let definition; global.Page = p => { definition = p; };
  const file = require.resolve('../miniprogram/pages/' + name + '/' + name + '.js'); delete require.cache[file]; require(file);
  definition.data = JSON.parse(JSON.stringify(definition.data));
  definition.setData = changes => { for (const [key, value] of Object.entries(changes)) { const parts = key.replace(/\[(\d+)\]/g, '.$1').split('.'); let target = definition.data; for (const part of parts.slice(0, -1)) { target = target[part]; } target[parts.at(-1)] = value; } };
  return definition;
}
test('home controller loads seed data and filters direction, area, date and fees', async () => {
  setup(); const home = page('home'); await home.load(); assert.equal(home.data.error, ''); assert.equal(home.data.filteredTrips.length, 2);
  home.setCity({ detail: { value: '安吉' } }); assert.equal(home.data.filteredTrips.length, 1);
  home.setFee({ detail: { value: '1' } }); assert.equal(home.data.filteredTrips.length, 0);
  home.resetFilters(); home.setDirection({ currentTarget: { dataset: { value: 'school' } } }); assert.equal(home.data.filteredTrips.length, 1);
});
test('publish form persists a real domain trip and routes to its details', async () => {
  const env = setup(); const publish = page('publish'); publish.data.profile = await api.call('profile'); const route = publish.data.profile.routeTemplates[0]; publish.data.templateOptions = [{ id: '', name: '请选择常用线路' }, route]; publish.template({ detail: { value: '1' } }); publish.data.form = Object.assign(publish.data.form, { date: dateAfter(2), time: '18:00', seats: '2', ownCount: '2', feeMode: 'fixed', fixedYuan: '25', rateYuan: '0', tollYuan: '0' });
  await publish.submit(); assert.ok(env.routes[0].startsWith('/pages/detail/detail?id=')); const mine = await api.call('mine'); assert.equal(mine.trips[0].fixedFen, 2500); assert.equal(publish.data.busy, false);
});
test('profile input and student creation survive storage and page reload', async () => {
  setup(); const profile = page('profile'); await profile.load(); profile.addStudent(); profile.studentInput({ currentTarget: { dataset: { index: 1, key: 'name' } }, detail: { value: '林二同学' } });
  await profile.save(); await profile.load(); assert.equal(profile.data.profile.students.length, 2); assert.ok(profile.data.profile.students[1].id);
});
test('detail projects bill estimates, invitation visibility and copyable confirmation', async () => {
  const env = setup(); let t = await api.call('apply', { tripId: 't1', studentId: 's1' }); const id = t.applications[0].id;
  api.switchUser('driver'); await api.call('accept', { tripId: 't1', applicationId: id }); api.switchUser('parent');
  const detail = page('detail'); detail.onLoad({ id: 't1' }); await detail.load(); assert.equal(detail.data.error, ''); assert.ok(detail.data.estimate.includes('17.33')); assert.equal(detail.data.students.length, 0);
  detail.copyCard({ currentTarget: { dataset: { id } } }); assert.ok(env.storage.clipboard.includes('接送确认单')); assert.ok(env.storage.clipboard.includes('林同学')); assert.ok(env.storage.clipboard.includes('GX民高拼车'));
});
test('journeys puts ride demands together with other pending arrangements', async () => {
  setup(); await api.call('apply', { tripId: 't1', studentId: 's1' }); const journeys = page('journeys'); await journeys.load(); assert.equal(journeys.data.filtered.length, 2); assert.equal(journeys.data.filtered.some(item => item.itemType === 'need'), true);
  api.switchUser('driver'); await journeys.load(); journeys.tab({ currentTarget: { dataset: { value: 'drive' } } }); assert.equal(journeys.data.filtered.length, 2);
});
test('failed form submission asks for a saved route template without navigating', async () => {
  const env = setup(); const publish = page('publish'); publish.data.profile = await api.call('profile'); await publish.submit(); assert.equal(env.routes.length, 0); assert.ok(env.notices.some(n => n.includes('常用线路'))); assert.equal(publish.data.busy, false);
});
