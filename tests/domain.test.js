const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execute, calculateBill } = require('../miniprogram/core/domain');
const { seed, dateAfter } = require('../miniprogram/core/seed');
function harness() {
  let state = seed(), serial = Promise.resolve(), next = 0;
  const clone = x => x == null ? null : JSON.parse(JSON.stringify(x));
  const run = (uid, action, data = {}, ctx = {}) => {
    const transact = async () => {
      const working = clone(state);
      const repo = { get: async (table, id) => clone(working[table][id]), list: async table => Object.values(working[table]), put: async (table, id, doc) => { working[table][id] = clone(doc); } };
      const result = await execute(repo, uid, action, data, Object.assign({ id: () => 'test_' + (++next) }, ctx));
      state = working; return result;
    };
    const result = serial.then(transact); serial = result.catch(() => {}); return result;
  };
  return { run, state: () => state };
}
async function apply(h, tripId = 't1', uid = 'parent', studentId = 's1') { const t = await h.run(uid, 'apply', { tripId, studentId }); return t.applications.at(-1).id; }
async function accepted(h, tripId = 't1', owner = 'driver') { const id = await apply(h, tripId); await h.run(owner, 'accept', { tripId, applicationId: id }); return id; }
async function handed(h, tripId = 't1', owner = 'driver') { const id = await accepted(h, tripId, owner); await h.run('parent', 'inform', { tripId, applicationId: id, method: '入校前交付纸质确认单' }); for (const status of ['boarded', 'arrived', 'handed']) await h.run(owner, 'progress', { tripId, applicationId: id, status, note: '已交给学生母亲' }); return id; }
test('public lists and unconfirmed details do not expose contacts, vehicle or students', async () => {
  const h = harness(); const list = await h.run('parent', 'list'); assert.equal(list.trips[0].phone, undefined); assert.equal(list.needs[0].studentName, undefined);
  const id = await apply(h); const detail = await h.run('other', 'detail', { tripId: 't1' }); assert.equal(detail.phone, ''); assert.equal(detail.meet, ''); assert.deepEqual(detail.applications, []);
  const driver = await h.run('driver', 'detail', { tripId: 't1' }); assert.equal(driver.applications[0].phone, ''); assert.equal(driver.applications[0].code, '');
  await h.run('driver', 'accept', { tripId: 't1', applicationId: id }); const confirmed = await h.run('parent', 'detail', { tripId: 't1' }); assert.ok(confirmed.phone); assert.ok(confirmed.applications[0].code);
});
test('pending applications do not occupy seats; concurrent final-seat confirmations only accept one', async () => {
  const h = harness(); const profile = await h.run('parent', 'profile'); profile.students.push({ id: 's4', name: '另一孩子' }); await h.run('parent', 'saveProfile', profile);
  const first = await apply(h, 't2'), second = await apply(h, 't2', 'parent', 's4'); assert.equal(h.state().trips.t2.applications.length, 2);
  const results = await Promise.allSettled([h.run('other', 'accept', { tripId: 't2', applicationId: first }), h.run('other', 'accept', { tripId: 't2', applicationId: second })]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1); assert.equal(h.state().trips.t2.applications.filter(a => a.status === 'confirmed').length, 1);
});
test('duplicate applications, self applications and cross-household acceptance are rejected', async () => {
  const h = harness(); const id = await apply(h); await assert.rejects(apply(h), /已申请/); await assert.rejects(h.run('driver', 'apply', { tripId: 't1', studentId: 's2' }), /自己的/); await assert.rejects(h.run('other', 'accept', { tripId: 't1', applicationId: id }), /无法确认/);
});
test('same child cannot confirm overlapping trips; cancellation releases commitment', async () => {
  const h = harness(); const a = await apply(h), b = await apply(h, 't2');
  await h.run('driver', 'accept', { tripId: 't1', applicationId: a }); await assert.rejects(h.run('other', 'accept', { tripId: 't2', applicationId: b }), /4 小时/);
  await h.run('parent', 'cancelApplication', { tripId: 't1', applicationId: a, reason: '与家长协商后改乘' }); await h.run('other', 'accept', { tripId: 't2', applicationId: b });
});
test('student informed state and sequence are required; passengers cannot fake boarding', async () => {
  const h = harness(); const id = await accepted(h); const payload = { tripId: 't1', applicationId: id, status: 'boarded' };
  await assert.rejects(h.run('driver', 'progress', payload), /知晓/); await assert.rejects(h.run('parent', 'progress', payload), /开车家长/);
  await h.run('parent', 'inform', { tripId: 't1', applicationId: id, method: '入校前告知' }); await assert.rejects(h.run('driver', 'progress', { ...payload, status: 'handed' }), /顺序/);
  await h.run('driver', 'progress', payload); await assert.rejects(h.run('parent', 'cancelApplication', { ...payload, reason: '取消' }), /上车后/);
});
test('exception preserves the seat and resumes previous phase only after driver resolution', async () => {
  const h = harness(); const id = await accepted(h); await h.run('parent', 'exception', { tripId: 't1', applicationId: id, note: '学生未到集合点' }); assert.equal(h.state().trips.t1.applications[0].status, 'exception');
  await assert.rejects(h.run('parent', 'resolveException', { tripId: 't1', applicationId: id, note: '核实完成' }), /开车家长/);
  await h.run('driver', 'resolveException', { tripId: 't1', applicationId: id, note: '已联系，学生仍在校内，继续等待' }); assert.equal(h.state().trips.t1.applications[0].status, 'confirmed');
});
test('AA divides only actual completed riders and driver household, conserving fen', () => {
  const bill = calculateBill({ feeMode: 'aa', ownCount: 2, rateFen: 80, applications: [{ id: 'a', parentId: 'p', status: 'handed' }, { id: 'b', status: 'cancelled' }] }, 65, 1);
  assert.equal(bill.totalPeople, 3); assert.equal(bill.totalFen, 5201); assert.equal(bill.shares[0].amountFen, 1733); assert.equal(bill.ownShareFen + bill.shares[0].amountFen, 5201);
});
test('end-to-end AA handover, bill approval and independent offline settlement', async () => {
  const h = harness(); const id = await handed(h);
  await h.run('driver', 'createBill', { tripId: 't1', actualKm: 68, tollFen: 1000 }); const params = { tripId: 't1', applicationId: id };
  await assert.rejects(h.run('driver', 'markPaid', params), /确认金额/); await assert.rejects(h.run('driver', 'confirmBill', params), /搭乘家长/); await h.run('parent', 'confirmBill', params); await h.run('parent', 'markPaid', params);
  assert.equal(h.state().trips.t1.bill.shares[0].driverPaid, false); await h.run('driver', 'markPaid', params); assert.equal(h.state().trips.t1.bill.shares[0].driverPaid, true);
  await assert.rejects(h.run('driver', 'createBill', { tripId: 't1', actualKm: 70 }), /一次账单/);
});
test('fixed price and free modes calculate exact charges', async () => {
  for (const [tripId, owner, amount] of [['t2', 'other', 6000], ['t3', 'driver', 0]]) { const h = harness(); await handed(h, tripId, owner); await h.run(owner, 'createBill', { tripId }); assert.equal(h.state().trips[tripId].bill.shares[0].amountFen, amount); }
});
test('invitations must be accepted by invited parent and close only linked need', async () => {
  const h = harness(); const invited = await h.run('driver', 'invite', { tripId: 't1', needId: 'n1' }); const a = invited.applications[0]; assert.equal(a.status, 'invited'); assert.equal(invited.remaining, 2);
  await assert.rejects(h.run('driver', 'accept', { tripId: 't1', applicationId: a.id }), /无法确认/); await h.run('parent', 'accept', { tripId: 't1', applicationId: a.id }); assert.equal(h.state().needs.n1.status, 'matched');
});
test('cancelling an accepted invitation reopens its demand but never explicitly closed demands', async () => {
  for (const closed of [false, true]) {
    const h = harness(); const t = await h.run('driver', 'invite', { tripId: 't1', needId: 'n1' }); const applicationId = t.applications[0].id;
    await h.run('parent', 'accept', { tripId: 't1', applicationId });
    if (closed) await h.run('parent', 'closeNeed', { needId: 'n1' });
    await h.run('parent', 'cancelApplication', { tripId: 't1', applicationId, reason: '行程调整' });
    assert.equal(h.state().needs.n1.status, closed ? 'closed' : 'open');
  }
});
test('closed demand cannot be accepted through an old invitation; transaction rolls back seat and schedule', async () => {
  const h = harness(); const t = await h.run('driver', 'invite', { tripId: 't1', needId: 'n1' });
  await h.run('parent', 'closeNeed', { needId: 'n1' });
  await assert.rejects(h.run('parent', 'accept', { tripId: 't1', applicationId: t.applications[0].id }), /需求已关闭/);
  assert.equal(h.state().trips.t1.applications[0].status, 'invited'); assert.deepEqual(h.state().profiles.parent.commitments, []);
});
test('cancelling a trip clears every child commitment including siblings', async () => {
  const h = harness(); const p = await h.run('parent', 'profile'); p.students.push({ id: 's4', name: '另一孩子' }); await h.run('parent', 'saveProfile', p);
  const a = await accepted(h); const b = await apply(h, 't1', 'parent', 's4'); await h.run('driver', 'accept', { tripId: 't1', applicationId: b }); assert.equal(h.state().profiles.parent.commitments.length, 2);
  await h.run('driver', 'cancelTrip', { tripId: 't1', reason: '车辆故障，已联系两位家长' }); assert.equal(h.state().profiles.parent.commitments.length, 0); assert.equal(h.state().trips.t1.status, 'cancelled');
});
test('blocking prevents applications and favorite prioritizes the driver', async () => {
  const h = harness(); await h.run('parent', 'favorite', { userId: 'other' }); assert.equal((await h.run('parent', 'list')).trips[0].ownerId, 'other'); await h.run('parent', 'block', { userId: 'driver' }); assert.equal((await h.run('parent', 'list')).trips.some(t => t.ownerId === 'driver'), false); await assert.rejects(apply(h), /无法与该家长/);
});
test('profile updates cannot grant verification or inject schedule commitments', async () => {
  const h = harness(); const p = await h.run('parent', 'profile'); p.verified = true; p.commitments = [{ studentId: 'forged' }]; const saved = await h.run('parent', 'saveProfile', p); assert.equal(saved.verified, false); assert.deepEqual(saved.commitments, []);
});
test('publishing validates costs, capacity, future and real calendar dates', async () => {
  const h = harness(); const template = await h.run('driver', 'saveTemplate', { name: '南宁线路', direction: 'home', city: '南宁', feeMode: 'aa', seats: 2, ownCount: 2, meet: '约定集合点', drop: '约定下车点', rateFen: 80, estimatedKm: 65, tollFen: 0, vehicleId: 'v2' }); const templateId = template.routeTemplates.at(-1).id; const p = { templateId, date: dateAfter(2), time: '17:30', feeMode: 'aa', seats: 2, ownCount: 2, rateFen: 80, estimatedKm: 65, tollFen: 0 };
  await assert.rejects(h.run('driver', 'publish', { ...p, seats: 6 }), /实际座位/); await assert.rejects(h.run('driver', 'publish', { ...p, rateFen: -1 }), /成本/); await assert.rejects(h.run('driver', 'publish', { ...p, date: '2020-01-01' }), /晚于/); await assert.rejects(h.run('driver', 'publish', { ...p, date: '2030-02-30' }), /日期不存在/);
  const created = await h.run('driver', 'publish', p); assert.ok(created.id);
});
test('route templates and multiple vehicle profiles are reusable without changing old trips', async () => {
  const h = harness(); const driver = await h.run('driver', 'profile');
  driver.vehicles.push({ id: 'v4', name: '七座车', car: '黑色 MPV', plate: '桂A·演示04' }); await h.run('driver', 'saveProfile', driver);
  const p = { name: '南宁安吉返校', mode: 'drive', direction: 'school', city: '南宁 · 安吉', via: '安吉大道', meet: '安吉客运站', drop: '学校校外点', seats: 3, ownCount: 2, feeMode: 'fixed', fixedFen: 3500, vehicleId: 'v4' };
  const saved = await h.run('driver', 'saveTemplate', p); const template = saved.routeTemplates.at(-1); assert.equal(template.vehicleId, 'v4');
  const created = await h.run('driver', 'publish', { ...p, templateId: template.id, date: dateAfter(4), time: '14:00' }); const trip = h.state().trips[created.id];
  assert.equal(trip.templateName, '南宁安吉返校'); assert.equal(trip.plate, '桂A·演示04'); assert.equal(trip.fixedFen, 3500);
  await h.run('driver', 'deleteTemplate', { templateId: template.id }); assert.ok(h.state().trips[created.id]); assert.equal((await h.run('driver', 'profile')).routeTemplates.some(t => t.id === template.id), false);
});
test('need locations remain private in public list and travel with accepted invitation', async () => {
  const h = harness(); const saved = await h.run('parent', 'saveTemplate', { name: '安吉回家', direction: 'home', city: '南宁 · 安吉', feeMode: 'free', studentId: 's1', meet: '安吉上车点', drop: '江南下车点' }); const templateId = saved.routeTemplates.at(-1).id; await h.run('parent', 'publishNeed', { templateId, date: dateAfter(1), time: '17:30', feeMode: 'free', studentId: 's1' });
  const need = Object.values(h.state().needs).at(-1); assert.equal((await h.run('other', 'list')).needs.find(n => n.id === need.id).meet, undefined);
  const invitation = await h.run('driver', 'invite', { tripId: 't1', needId: need.id }); const a = invitation.applications.at(-1); assert.equal(a.meet, '安吉上车点'); assert.equal(a.drop, '江南下车点');
});
test('cannot bill while another student has unfinished handover', async () => {
  const h = harness(); await handed(h); const p = await h.run('other', 'profile'); const a = await apply(h, 't1', 'other', p.students[0].id); await h.run('driver', 'accept', { tripId: 't1', applicationId: a }); await assert.rejects(h.run('driver', 'createBill', { tripId: 't1', actualKm: 65 }), /未完成交接/);
});
test('trip gender requirements gate applications and invitations', async () => {
  const h = harness();
  const saved = await h.run('driver', 'saveTemplate', { name: '仅女生回家', direction: 'home', city: '南宁 · 安吉', feeMode: 'free', seats: 2, ownCount: 2, meet: '集合点', drop: '下车点' });
  const templateId = saved.routeTemplates.at(-1).id;
  const created = await h.run('driver', 'publish', { templateId, date: dateAfter(3), time: '17:30', seats: 2, ownCount: 2, feeMode: 'free', riderGender: 'girl' });
  const tripId = created.id; assert.equal(h.state().trips[tripId].riderGender, 'girl');
  await apply(h, tripId, 'parent', 's1'); await h.run('other', 'apply', { tripId, studentId: 's3' });
  const p = await h.run('other', 'profile'); p.students.push({ id: 'sb', name: '男同学', gender: 'boy' }, { id: 'su', name: '未填性别同学' }); await h.run('other', 'saveProfile', p);
  await assert.rejects(h.run('other', 'apply', { tripId, studentId: 'sb' }), /仅接受女生/);
  await assert.rejects(h.run('other', 'apply', { tripId, studentId: 'su' }), /仅接受女生/);
  const saved2 = await h.run('other', 'saveTemplate', { name: '男生回家', direction: 'home', city: '南宁 · 安吉', feeMode: 'free', meet: '集合点', drop: '下车点' });
  await h.run('other', 'publishNeed', { templateId: saved2.routeTemplates.at(-1).id, date: dateAfter(3), time: '17:30', feeMode: 'free', studentId: 'sb' });
  const need = Object.values(h.state().needs).at(-1); assert.equal(need.studentGender, 'boy');
  await assert.rejects(h.run('driver', 'invite', { tripId, needId: need.id }), /仅接受女生/);
  const list = await h.run('parent', 'list'); assert.equal(list.trips.find(t => t.id === tripId).riderGenderLabel, '仅女生');
  assert.equal((await h.run('driver', 'detail', { tripId })).applications.filter(a => a.studentGender === 'girl').length, 2);
});
