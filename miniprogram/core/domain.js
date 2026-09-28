/* Shared domain layer: storage and transport independent. Money is stored in fen. */
const SCHOOL = '武鸣民族高中';
const ACTIVE = ['confirmed', 'boarded', 'arrived', 'exception'];
const STATUS = { pending: '待确认', invited: '待家长接受', confirmed: '已确认', boarded: '已上车', arrived: '已到达', handed: '已交接', rejected: '未接受', cancelled: '已取消', exception: '异常待处理' };
class DomainError extends Error { constructor(message) { super(message); this.code = 'BUSINESS_ERROR'; } }
function assert(value, message) { if (!value) throw new DomainError(message); }
function clean(v, max = 200) { return String(v || '').trim().slice(0, max); }
function number(v, min, max, label) { const n = Number(v); assert(Number.isFinite(n) && n >= min && n <= max, label + '不正确'); return n; }
function integer(v, min, max, label) { const n = number(v, min, max, label); assert(Number.isInteger(n), label + '须为整数'); return n; }
function required(v, label, max = 200) { const s = clean(v, max); assert(s, '请填写' + label); return s; }
function phone(v, optional) { const s = clean(v, 20); assert((optional && !s) || /^1\d{10}$/.test(s), '请填写正确的 11 位手机号'); return s; }
function feeLabel(t) { return t.feeMode === 'free' ? '免费互助' : t.feeMode === 'fixed' ? '¥' + (t.fixedFen / 100).toFixed(2) + ' / 人' : '按实际公里 AA'; }
function genderLabel(g) { return g === 'boy' ? '男生' : g === 'girl' ? '女生' : ''; }
function riderGenderLabel(v) { return v === 'boy' ? '仅男生' : v === 'girl' ? '仅女生' : '不限性别'; }
/* 学生性别须符合行程要求；未填写性别时不接受限定性别的行程。 */
function genderOk(required, student) { return !required || required === 'any' || (student && student.gender === required); }
function genderRejectMessage(required) { return '本行程仅接受' + (required === 'girl' ? '女生' : '男生') + '搭乘，请核对孩子性别或联系车主'; }
function validDate(date, time, now) {
  assert(/^\d{4}-\d{2}-\d{2}$/.test(date) && /^([01]\d|2[0-3]):[0-5]\d$/.test(time), '日期或时间格式不正确');
  const stamp = Date.parse(date + 'T' + time + ':00+08:00');
  assert(Number.isFinite(stamp) && new Date(stamp + 8 * 3600000).toISOString().slice(0, 10) === date, '日期不存在');
  assert(Number.isFinite(stamp) && stamp > now, '出发时间必须晚于当前时间');
  return stamp;
}
function occupied(t) { return t.applications.filter(a => ACTIVE.includes(a.status) || a.status === 'handed').length; }
function publicTrip(t) {
  return { id: t.id, ownerId: t.ownerId, ownerName: t.ownerName, direction: t.direction, city: t.city, via: t.via,
    date: t.date, time: t.time, departAt: t.departAt, from: t.direction === 'home' ? SCHOOL : t.city,
    to: t.direction === 'home' ? t.city : SCHOOL, seats: t.seats, remaining: t.seats - occupied(t), status: t.status,
    feeMode: t.feeMode, feeLabel: feeLabel(t), fixedFen: t.fixedFen, rateFen: t.rateFen, estimatedKm: t.estimatedKm,
    tollFen: t.tollFen, ownCount: t.ownCount, riderGender: t.riderGender || 'any', riderGenderLabel: riderGenderLabel(t.riderGender), createdAt: t.createdAt };
}
function publicNeed(n) { return { id: n.id, ownerId: n.ownerId, ownerName: n.ownerName, direction: n.direction, city: n.city, date: n.date, time: n.time, feeMode: n.feeMode, status: n.status, templateName: n.templateName || '', studentGenderLabel: genderLabel(n.studentGender) }; }
function visibleTrip(t, uid) {
  const base = publicTrip(t), owner = t.ownerId === uid;
  const own = t.applications.filter(a => a.parentId === uid);
  const canContact = owner || own.some(a => ACTIVE.includes(a.status) || a.status === 'handed');
  return Object.assign(base, { isOwner: owner, applications: (owner ? t.applications : own).map(a => {
    const shareContact = ACTIVE.includes(a.status) || a.status === 'handed';
    return Object.assign({}, a, { statusLabel: STATUS[a.status], phone: shareContact ? a.phone : '', backup: shareContact ? a.backup : '', code: shareContact ? a.code : '' });
  }),
    meet: canContact ? t.meet : '', drop: canContact ? t.drop : '', plate: canContact ? t.plate : '', car: canContact ? t.car : '',
    phone: canContact ? t.phone : '', backup: canContact ? t.backup : '', note: canContact ? t.note : '', bill: t.bill ? Object.assign({}, t.bill, { shares: t.bill.shares.filter(s => owner || own.some(a => a.id === s.applicationId)) }) : null });
}
function conflict(profile, trip, studentId) { return (profile.commitments || []).some(c => c.tripId !== trip.id && c.studentId === studentId && Math.abs(c.departAt - trip.departAt) < 4 * 3600000); }
function addCommitment(p, t, a) { p.commitments = (p.commitments || []).filter(c => c.applicationId !== a.id); p.commitments.push({ tripId: t.id, applicationId: a.id, studentId: a.studentId, departAt: t.departAt }); }
function removeCommitment(p, id) { p.commitments = (p.commitments || []).filter(c => c.applicationId !== id); }
function calculateBill(t, km, tollFen) {
  const riders = t.applications.filter(a => a.status === 'handed');
  assert(riders.length, '至少完成一位学生的交接后才能生成账单');
  const totalPeople = t.ownCount + riders.length;
  const totalFen = t.feeMode === 'free' ? 0 : t.feeMode === 'fixed' ? t.fixedFen * riders.length : Math.round(km * t.rateFen) + tollFen;
  const each = t.feeMode === 'free' ? 0 : t.feeMode === 'fixed' ? t.fixedFen : Math.floor(totalFen / totalPeople);
  return { actualKm: km, tollFen, totalFen, totalPeople, ownShareFen: t.feeMode === 'aa' ? totalFen - each * riders.length : 0,
    shares: riders.map(a => ({ applicationId: a.id, parentId: a.parentId, studentName: a.studentName, amountFen: each, confirmed: t.feeMode === 'free', driverPaid: t.feeMode === 'free', parentPaid: t.feeMode === 'free' })) };
}
async function execute(repo, uid, action, data = {}, ctx = {}) {
  assert(uid, '请先登录');
  const now = ctx.now || Date.now(), id = ctx.id || (() => 'id_' + now.toString(36) + Math.random().toString(36).slice(2, 10));
  const getProfile = async (userId = uid) => {
    const saved = await repo.get('profiles', userId);
    return Object.assign({ id: userId, name: '', phone: '', backup: '', plate: '', car: '', students: [], vehicles: [], routeTemplates: [], commitments: [], blocked: [], favorites: [], verified: false }, saved || {});
  };
  const reopenNeed = async a => {
    if (!a.needId) return;
    const n = await repo.get('needs', a.needId);
    if (n && n.status === 'matched' && n.matchedApplicationId === a.id) { n.status = 'open'; delete n.matchedApplicationId; await repo.put('needs', n.id, n); }
  };
  if (action === 'profile') return getProfile();
  const p = await getProfile();
  if (action === 'saveProfile') {
    const p = await getProfile();
    const students = (data.students || []).map(s => ({ id: s.id || id(), name: required(s.name, '学生姓名', 20), grade: clean(s.grade, 30), gender: ['boy', 'girl'].includes(s.gender) ? s.gender : '' }));
    assert(students.length <= 6 && new Set(students.map(s => s.id)).size === students.length, '学生信息不正确');
    p.name = required(data.name, '家长称呼', 20); p.phone = phone(data.phone); p.backup = phone(data.backup, true); p.students = students;
    const vehicles = (data.vehicles || []).map(v => ({ id: v.id || id(), name: required(v.name || v.car, '车辆名称', 30), plate: required(v.plate, '车牌', 15), car: required(v.car || v.name, '车辆颜色与型号', 40) }));
    assert(vehicles.length <= 5 && new Set(vehicles.map(v => v.id)).size === vehicles.length, '车辆档案不正确');
    p.plate = clean(data.plate, 15); p.car = clean(data.car, 40); p.vehicles = vehicles;
    // Compatibility for existing accounts: keep the first vehicle as the default car.
    if (vehicles[0]) { p.plate = vehicles[0].plate; p.car = vehicles[0].car; }
    p.updatedAt = now;
    await repo.put('profiles', uid, p); return p;
  }
  if (action === 'saveTemplate') {
    assert(p.name && p.phone, '请先保存家长档案');
    const mode = data.mode === 'need' ? 'need' : 'drive';
    const template = {
      id: data.id || id(), name: required(data.name, '模板名称', 30), mode: 'both',
      direction: ['home', 'school'].includes(data.direction) ? data.direction : 'home', city: required(data.city, '家庭端区域', 40),
      via: clean(data.via, 80), meet: clean(data.meet, 120), drop: clean(data.drop, 120),
      seats: integer(data.seats || 1, 1, 6, '空余座位'), ownCount: integer(data.ownCount || 1, 1, 7, '自家乘员人数'),
      feeMode: ['free', 'fixed', 'aa'].includes(data.feeMode) ? data.feeMode : 'free',
      fixedFen: integer(data.fixedFen || 0, 0, 100000, '固定费用'), rateFen: integer(data.rateFen || 0, 0, 1000, '每公里成本'),
      estimatedKm: number(data.estimatedKm || 0, 0, 2000, '预估公里'), tollFen: integer(data.tollFen || 0, 0, 100000, '预估过路费'), vehicleId: clean(data.vehicleId, 80)
    };
    assert(template.seats + template.ownCount <= 7, '请核对车辆实际座位');
    p.routeTemplates = (p.routeTemplates || []).filter(t => t.id !== template.id).concat(template).slice(-20);
    await repo.put('profiles', uid, p); return p;
  }
  if (action === 'deleteTemplate') {
    assert(data.templateId, '请选择路线模板'); p.routeTemplates = (p.routeTemplates || []).filter(t => t.id !== data.templateId); await repo.put('profiles', uid, p); return p;
  }
  if (action === 'list') {
    const p = await getProfile();
    const trips = await repo.list('trips'), needs = await repo.list('needs');
    return { trips: trips.filter(t => t.status === 'open' && t.departAt > now && !p.blocked.includes(t.ownerId)).map(publicTrip).sort((a, b) => Number(p.favorites.includes(b.ownerId)) - Number(p.favorites.includes(a.ownerId)) || a.departAt - b.departAt),
      needs: needs.filter(n => n.status === 'open' && n.departAt > now && !p.blocked.includes(n.ownerId)).map(publicNeed) };
  }
  if (action === 'mine') {
    const trips = await repo.list('trips');
    return { trips: trips.filter(t => t.ownerId === uid || t.applications.some(a => a.parentId === uid)).map(t => visibleTrip(t, uid)).sort((a, b) => b.createdAt - a.createdAt),
      needs: (await repo.list('needs')).filter(n => n.ownerId === uid) };
  }
  if (action === 'favorite' || action === 'block') {
    const p = await getProfile(), key = action === 'favorite' ? 'favorites' : 'blocked';
    assert(data.userId && data.userId !== uid, '请选择其他家长');
    p[key] = p[key].includes(data.userId) ? p[key].filter(v => v !== data.userId) : p[key].concat(data.userId);
    await repo.put('profiles', uid, p); return p;
  }
  if (action === 'report') {
    const report = { id: id(), reporter: uid, tripId: required(data.tripId, '行程'), reason: required(data.reason, '举报原因', 500), createdAt: now, status: 'pending' };
    await repo.put('reports', report.id, report); return { ok: true };
  }
  if (action === 'publish' || action === 'publishNeed') {
    assert(p.name && p.phone, '请先在“我的”完善家长及联系电话');
    const template = (p.routeTemplates || []).find(t => t.id === data.templateId);
    assert(template, '请先在“我的”保存线路模板，再选择模板发布');
    const feeMode = ['free', 'fixed', 'aa'].includes(data.feeMode) ? data.feeMode : template.feeMode;
    const departAt = validDate(data.date, data.time, now);
    const base = { id: id(), ownerId: uid, ownerName: p.name, direction: template.direction, city: template.city, date: data.date, time: data.time, departAt, feeMode, templateId: template.id, templateName: template.name, createdAt: now, status: 'open' };
    if (action === 'publishNeed') {
      const student = p.students.find(s => s.id === data.studentId); assert(student, '请先添加并选择孩子');
      const need = Object.assign(base, { studentId: student.id, studentName: student.name, studentGender: student.gender || '', meet: template.meet, drop: template.drop });
      await repo.put('needs', need.id, need); return { id: need.id };
    }
    const vehicle = (p.vehicles || []).find(v => v.id === data.vehicleId) || (p.plate && p.car ? { plate: p.plate, car: p.car } : null);
    assert(vehicle, '发布驾车行程前请完善车辆档案');
    const t = Object.assign(base, { via: template.via, seats: integer(data.seats || template.seats, 1, 6, '空余座位'), ownCount: integer(data.ownCount || template.ownCount, 1, 7, '自家乘员人数'),
      meet: required(template.meet, '集合点', 120), drop: required(template.drop, '下车点', 120), note: clean(data.note, 300), phone: p.phone, backup: p.backup, plate: vehicle.plate, car: vehicle.car, vehicleId: vehicle.id || '',
      fixedFen: data.feeMode === 'fixed' ? integer(data.fixedFen, 1, 100000, '固定费用') : 0,
      rateFen: data.feeMode === 'aa' ? integer(data.rateFen, 1, 1000, '每公里成本') : 0,
      estimatedKm: data.feeMode === 'aa' ? number(data.estimatedKm, 1, 2000, '预估公里') : 0,
      tollFen: data.feeMode === 'aa' ? integer(data.tollFen || 0, 0, 100000, '过路费') : 0,
      riderGender: ['boy', 'girl'].includes(data.riderGender) ? data.riderGender : 'any', applications: [], bill: null });
    assert(t.seats + t.ownCount <= 7, '本版本限 7 座及以下车辆，请核对实际座位');
    await repo.put('trips', t.id, t); return { id: t.id };
  }
  if (action === 'closeNeed') { const n = await repo.get('needs', data.needId); assert(n && n.ownerId === uid, '无权操作此需求'); n.status = 'closed'; await repo.put('needs', n.id, n); return { ok: true }; }
  const t = await repo.get('trips', data.tripId); assert(t, '行程不存在或已移除');
  if (action === 'detail') return visibleTrip(t, uid);
  const owner = t.ownerId === uid;
  const driver = owner ? p : await getProfile(t.ownerId);
  if (action === 'apply' || action === 'invite') {
    assert(t.status === 'open' && t.departAt > now, '行程已关闭或已到出发时间');
    assert(t.seats > occupied(t), '暂无空余座位');
    assert(t.applications.length < 100, '此行程申请记录已达上限');
    let parent = p, student, need;
    if (action === 'invite') {
      assert(owner, '仅开车家长可以邀请'); need = await repo.get('needs', data.needId);
      assert(need && need.status === 'open' && need.ownerId !== uid && need.date === t.date && need.direction === t.direction, '需求日期或方向不符合此行程');
      parent = await getProfile(need.ownerId); student = parent.students.find(s => s.id === need.studentId);
    } else { assert(!owner, '不能申请自己的行程'); student = p.students.find(s => s.id === data.studentId); }
    assert(parent.phone && student, '请先完善家长电话和学生档案');
    assert(genderOk(t.riderGender, student), genderRejectMessage(t.riderGender));
    assert(!driver.blocked.includes(parent.id) && !parent.blocked.includes(driver.id), '暂时无法与该家长拼车');
    assert(!t.applications.some(a => a.studentId === student.id && a.parentId === parent.id && !['cancelled', 'rejected'].includes(a.status)), '此学生已申请或已收到邀请');
    assert(!conflict(parent, t, student.id), '该学生在前后 4 小时内已有确认行程');
    t.applications.push({ id: id(), studentId: student.id, studentName: student.name, studentGender: student.gender || '', parentId: parent.id, parentName: parent.name, phone: parent.phone, backup: parent.backup,
      meet: need ? need.meet : clean(data.meet, 120), drop: need ? need.drop : clean(data.drop, 120),
      status: action === 'invite' ? 'invited' : 'pending', informed: false, informMethod: '', code: String(Math.floor(100000 + Math.random() * 900000)), needId: need ? need.id : '', createdAt: now, events: [] });
  } else if (action === 'accept') {
    assert(t.status === 'open' && t.departAt > now, '行程已关闭或已到出发时间');
    const a = t.applications.find(v => v.id === data.applicationId); assert(a, '申请不存在');
    assert((owner && a.status === 'pending') || (a.parentId === uid && a.status === 'invited'), '无法确认此申请');
    assert(t.seats > occupied(t), '座位已满');
    assert(genderOk(t.riderGender, { gender: a.studentGender }), genderRejectMessage(t.riderGender));
    const parent = await getProfile(a.parentId);
    assert(!driver.blocked.includes(parent.id) && !parent.blocked.includes(driver.id), '暂时无法与该家长拼车');
    assert(!conflict(parent, t, a.studentId), '学生前后 4 小时内已有确认行程');
    a.status = 'confirmed'; a.events.push({ text: '双方已确认搭乘', at: now }); addCommitment(parent, t, a); await repo.put('profiles', parent.id, parent);
    if (a.needId) { const n = await repo.get('needs', a.needId); assert(n && n.status === 'open', '该需求已关闭或已匹配其他车辆'); n.status = 'matched'; n.matchedApplicationId = a.id; await repo.put('needs', n.id, n); }
  } else if (action === 'cancelApplication') {
    const a = t.applications.find(v => v.id === data.applicationId); assert(a && (owner || a.parentId === uid), '无权操作');
    assert(['pending', 'invited', 'confirmed'].includes(a.status), '上车后请通过异常记录处理，不能取消');
    a.status = owner && a.status === 'pending' ? 'rejected' : 'cancelled';
    a.events.push({ text: '取消 / 拒绝：' + required(data.reason, '原因', 160), at: now });
    const parent = await getProfile(a.parentId); removeCommitment(parent, a.id); await repo.put('profiles', parent.id, parent);
    await reopenNeed(a);
  } else if (action === 'inform') {
    const a = t.applications.find(v => v.id === data.applicationId); assert(a && a.parentId === uid && a.status === 'confirmed', '仅搭乘家长可以确认告知');
    a.informed = true; a.informMethod = required(data.method, '告知方式', 120); a.events.push({ text: '学生已知晓：' + a.informMethod, at: now });
  } else if (action === 'progress') {
    assert(owner, '仅开车家长可以记录接送进度');
    const a = t.applications.find(v => v.id === data.applicationId); assert(a, '申请不存在');
    const next = { confirmed: 'boarded', boarded: 'arrived', arrived: 'handed' }[a.status];
    assert(next && data.status === next, '请按实际接送顺序记录');
    assert(a.informed, '请先由搭乘家长确认学生已知晓接送安排');
    if (next === 'handed') a.handover = required(data.note, '交接对象或返校下车情况', 160);
    a.status = next; a.events.push({ text: STATUS[next] + (next === 'handed' ? '：' + a.handover : ''), at: now });
    // Retain time conflict record after handover to prevent overlapping historical confirmations.
  } else if (action === 'exception') {
    const a = t.applications.find(v => v.id === data.applicationId); assert(a && (owner || a.parentId === uid) && ACTIVE.includes(a.status), '当前无法登记异常');
    if (a.status !== 'exception') a.previousStatus = a.status;
    a.status = 'exception'; a.events.push({ text: '异常：' + required(data.note, '异常说明', 200), at: now });
  } else if (action === 'resolveException') {
    assert(owner, '由开车家长记录处理结果'); const a = t.applications.find(v => v.id === data.applicationId); assert(a && a.status === 'exception', '没有待处理异常');
    a.status = a.previousStatus; a.events.push({ text: '异常处理：' + required(data.note, '处理结果', 200), at: now }); delete a.previousStatus;
  } else if (action === 'cancelTrip') {
    assert(owner && t.status === 'open', '无法取消此行程'); assert(!t.applications.some(a => ['boarded', 'arrived', 'handed', 'exception'].includes(a.status)), '已有接送记录，请处理学生交接，不能取消行程');
    const reason = required(data.reason, '取消原因', 160); t.status = 'cancelled';
    for (const a of t.applications.filter(a => ['pending', 'invited', 'confirmed'].includes(a.status))) { a.status = 'cancelled'; a.events.push({ text: '开车家长取消行程：' + reason, at: now }); const parent = await getProfile(a.parentId); removeCommitment(parent, a.id); await repo.put('profiles', parent.id, parent); await reopenNeed(a); }
  } else if (action === 'createBill') {
    assert(owner && !t.bill, '仅开车家长可生成一次账单'); assert(!t.applications.some(a => ACTIVE.includes(a.status)), '仍有学生未完成交接，请先处理');
    const km = t.feeMode === 'aa' ? number(data.actualKm, 1, 2000, '实际公里') : 0;
    const toll = t.feeMode === 'aa' ? integer(data.tollFen || 0, 0, 100000, '实际过路费') : 0;
    t.bill = Object.assign(calculateBill(t, km, toll), { createdAt: now }); t.status = 'completed';
    t.applications.forEach(a => { if (['pending', 'invited'].includes(a.status)) a.status = 'cancelled'; });
  } else if (action === 'confirmBill' || action === 'markPaid') {
    assert(t.bill, '尚未生成账单'); const s = t.bill.shares.find(v => v.applicationId === data.applicationId); assert(s, '账单不存在');
    if (action === 'confirmBill') { assert(s.parentId === uid, '仅搭乘家长可确认金额'); s.confirmed = true; }
    else { assert(s.confirmed, '请先由搭乘家长确认金额'); assert(owner || s.parentId === uid, '无权操作'); if (owner) s.driverPaid = true; else s.parentPaid = true; }
  } else throw new DomainError('未知操作');
  t.updatedAt = now; await repo.put('trips', t.id, t); return visibleTrip(t, uid);
}
module.exports = { execute, calculateBill, publicTrip, visibleTrip, DomainError, STATUS, SCHOOL, occupied };
