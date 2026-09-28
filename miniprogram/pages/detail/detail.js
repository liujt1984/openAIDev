const api = require('../../services/api');
const { SCHOOL } = require('../../core/domain');
function yuan(fen) { return (fen / 100).toFixed(2); }
Page({
  data: { demo: api.demo, loading: true, busy: false, error: '', trip: null, profile: { students: [], routeTemplates: [] }, studentIndex: 0, routeTemplateIndex: 0, routeTemplates: [], actualKm: '', tollYuan: '0', feeRule: '', estimate: '', printText: '' },
  onLoad(options) { this.tripId = options.id; },
  onShow() { this.load(); },
  async onPullDownRefresh() { await this.load(); wx.stopPullDownRefresh(); },
  async load() { this.setData({ loading: true, error: '' }); try { const [trip, profile] = await Promise.all([api.call('detail', { tripId: this.tripId }), api.call('profile')]); this.render(trip, profile); } catch (e) { this.setData({ error: e.message }); } finally { this.setData({ loading: false }); } },
  render(trip, profile = this.data.profile) {
    trip.applications = trip.applications.map(a => Object.assign({}, a, { studentGenderLabel: a.studentGender === 'boy' ? '男生' : a.studentGender === 'girl' ? '女生' : '', canCancel: ['pending', 'invited', 'confirmed'].includes(a.status), canException: ['confirmed', 'boarded', 'arrived'].includes(a.status), canContact: ['confirmed', 'boarded', 'arrived', 'handed', 'exception'].includes(a.status), events: (a.events || []).map(event => Object.assign({}, event, { when: new Date(event.at + 8 * 3600000).toISOString().slice(5, 16).replace('T', ' ') })) }));
    if (trip.bill) {
      trip.bill.shares = trip.bill.shares.map(s => Object.assign({}, s, { yuan: yuan(s.amountFen), settled: s.driverPaid && s.parentPaid }));
      trip.bill.totalYuan = yuan(trip.bill.totalFen); trip.bill.tollYuan = yuan(trip.bill.tollFen); trip.bill.ownShareYuan = yuan(trip.bill.ownShareFen);
    }
    const ownApplications = trip.applications.filter(a => a.parentId === profile.id);
    const activeStudents = ownApplications.filter(a => !['rejected', 'cancelled'].includes(a.status)).map(a => a.studentId);
    const genderEligible = s => trip.riderGender !== 'boy' && trip.riderGender !== 'girl' ? true : s.gender === trip.riderGender;
    const students = profile.students.filter(s => !activeStudents.includes(s.id) && genderEligible(s));
    const estimateTotal = trip.estimatedKm * trip.rateFen + trip.tollFen;
    const estimate = trip.feeMode === 'aa' ? '满座约 ¥' + yuan(Math.floor(estimateTotal / (trip.ownCount + trip.seats))) + ' / 学生；仅搭 1 人约 ¥' + yuan(Math.floor(estimateTotal / (trip.ownCount + 1))) : '';
    const feeRule = trip.feeMode === 'aa' ? '预估 ' + trip.estimatedKm + ' 公里 × ¥' + yuan(trip.rateFen) + ' / 公里 + 过路费 ¥' + yuan(trip.tollFen) + '，按实际乘员人数均分。' : trip.feeMode === 'fixed' ? '每位学生 ¥' + yuan(trip.fixedFen) + '。' : '免费互助。';
    const routeTemplates = (profile.routeTemplates || []).filter(t => t.direction === trip.direction && t.meet && t.drop);
    this.setData({ trip, profile, students, studentIndex: 0, routeTemplates, routeTemplateIndex: 0, feeRule, estimate, actualKm: this.data.actualKm || String(trip.estimatedKm || ''), canBill: trip.isOwner && !trip.bill && trip.applications.some(a => a.status === 'handed') && !trip.applications.some(a => ['confirmed', 'boarded', 'arrived', 'exception'].includes(a.status)), favorited: profile.favorites.includes(trip.ownerId) });
  },
  async act(action, payload = {}) {
    if (this.data.busy) return false;
    this.setData({ busy: true });
    try { const trip = await api.call(action, Object.assign({ tripId: this.tripId }, payload)); if (trip && trip.applications) this.render(trip); else await this.load(); wx.showToast({ title: '已记录', icon: 'success' }); return true; } catch (e) { api.error(e); return false; } finally { this.setData({ busy: false }); }
  },
  student(e) { this.setData({ studentIndex: Number(e.detail.value) }); },
  routeTemplate(e) { this.setData({ routeTemplateIndex: Number(e.detail.value) }); },
  input(e) { this.setData({ [e.currentTarget.dataset.key]: e.detail.value }); },
  async apply() { const s = this.data.students[this.data.studentIndex], route = this.data.routeTemplates[this.data.routeTemplateIndex]; if (!s) return api.error(new Error('请先在“我的”添加孩子，或查看已有申请')); if (!route) return api.error(new Error('请先在“我的”保存同方向的路线模板，再申请搭乘')); if (await api.confirm('为 ' + s.name + ' 申请搭乘？确认后请在接送信息中核对上、下车地点。')) this.act('apply', { studentId: s.id, meet: route.meet, drop: route.drop }); },
  async accept(e) { if (await api.confirm('确认此行程、费用方式和座位安排？接受后双方确认搭乘，请继续落实学生告知。')) this.act('accept', { applicationId: e.currentTarget.dataset.id }); },
  async cancelApplication(e) { const reason = await api.prompt('取消 / 拒绝原因', '若已确认，请同时联系对方'); if (reason !== null) this.act('cancelApplication', { applicationId: e.currentTarget.dataset.id, reason }); },
  async inform(e) { const method = await api.prompt('如何让学生知晓安排？', '例如：入校前已告知集合点和认车方式'); if (method !== null) this.act('inform', { applicationId: e.currentTarget.dataset.id, method }); },
  async progress(e) { const { id, status } = e.currentTarget.dataset; let note = ''; if (status === 'handed') { note = await api.prompt('记录交接情况', this.data.trip.direction === 'school' ? '记录实际下车点，不代表校方已确认入校' : '例如：已交给学生母亲，双方核对完成'); if (note === null) return; } else if (!await api.confirm(status === 'boarded' ? '请停车后核对学生姓名、接头编号，确认孩子已实际上车。' : '确认已实际到达约定下车点？到达尚不代表完成交接。')) return; this.act('progress', { applicationId: id, status, note }); },
  async exception(e) { const note = await api.prompt('记录接送异常', '例如：未到集合点，已联系家长等待核实'); if (note !== null) this.act('exception', { applicationId: e.currentTarget.dataset.id, note }); },
  async resolve(e) { const note = await api.prompt('异常处理结果', '记录核实情况，恢复此前接送阶段'); if (note !== null) this.act('resolveException', { applicationId: e.currentTarget.dataset.id, note }); },
  async cancelTrip() { const reason = await api.prompt('取消整个行程', '填写原因，并主动联系已确认家长'); if (reason !== null) this.act('cancelTrip', { reason }); },
  async bill() { if (await api.confirm('生成后金额不可自行更改，请核对实际共同路段公里及过路费。所有收费账单均需搭乘家长确认。')) this.act('createBill', { actualKm: this.data.actualKm, tollFen: Math.round(Number(this.data.tollYuan) * 100) }); },
  async confirmBill(e) { if (await api.confirm('确认账单金额与实际接送一致？')) this.act('confirmBill', { applicationId: e.currentTarget.dataset.id }); },
  async paid(e) { if (await api.confirm('仅在实际线下支付 / 收款后记录。双方都确认后才显示结清，平台不核验付款。')) this.act('markPaid', { applicationId: e.currentTarget.dataset.id }); },
  call(e) { if (api.demo) return api.error(new Error('演示号码不可拨打')); wx.makePhoneCall({ phoneNumber: e.currentTarget.dataset.phone }); },
  async favorite() { try { await api.call('favorite', { userId: this.data.trip.ownerId }); await this.load(); } catch (e) { api.error(e); } },
  async block() { try { if (!await api.confirm('屏蔽后不再推荐其新行程，已有行程仍保留。')) return; await api.call('block', { userId: this.data.trip.ownerId }); wx.showToast({ title: '已更新屏蔽状态' }); } catch (e) { api.error(e); } },
  async report() { const reason = await api.prompt('提交举报', api.demo ? '演示举报仅保存在本机' : '说明需要管理员核实的问题'); if (reason !== null) this.act('report', { reason }); },
  copyCard(e) {
    const t = this.data.trip, a = t.applications.find(v => v.id === e.currentTarget.dataset.id);
    const text = ['【GX民高拼车 · 接送确认单】', api.demo ? '演示数据，不可用于真实接送' : '', '学生：' + a.studentName + ' / 编号：' + a.code, t.date + ' ' + t.time, t.from + ' → ' + t.to, '集合：' + t.meet, '下车：' + t.drop, '开车家长：' + t.ownerName, '车辆：' + t.car + ' / ' + t.plate, '联系：' + t.phone + '；备用：' + (t.backup || '未填写'), '家长联系：' + a.phone, '费用：' + this.data.feeRule, '备注：' + (t.note || '无'), '学校：' + SCHOOL].filter(Boolean).join('\n');
    wx.setClipboardData({ data: text });
  },
  copyRoster() { const t = this.data.trip; const text = [t.date + ' ' + t.time + ' ' + t.from + ' → ' + t.to, '仅用于本次接送，请勿公开转发', ...t.applications.filter(a => a.canContact).map(a => [a.studentName, a.code, a.phone, a.informed ? '已告知' : '未告知', a.statusLabel].join(' | '))].join('\n'); wx.setClipboardData({ data: text }); }
});
