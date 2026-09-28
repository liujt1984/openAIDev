const api = require('../../services/api');
const { dateAfter } = require('../../core/seed');
const feeModes = ['free', 'fixed', 'aa'];
const emptyForm = () => ({ templateId: '', date: dateAfter(1), time: '17:30', seats: '1', ownCount: '1', vehicleId: '', feeMode: 'free', fixedYuan: '', rateYuan: '0.8', estimatedKm: '', tollYuan: '0', note: '', riderGender: 'any' });
const yuan = fen => fen ? (fen / 100).toFixed(2) : '';
Page({
  data: { kind: 'drive', profile: { students: [], vehicles: [], routeTemplates: [] }, templateOptions: [{ id: '', name: '请选择常用线路' }], templateIndex: 0, selected: null, form: emptyForm(), fees: ['免费互助', '固定费用', '按公里 AA'], feeIndex: 0, studentIndex: 0, vehicleIndex: 0, busy: false },
  onShow() { this.load(); },
  async load() { try { const profile = await api.call('profile'); profile.routeTemplates = profile.routeTemplates || []; profile.vehicles = profile.vehicles || []; this.setData({ profile, templateOptions: [{ id: '', name: '请选择常用线路' }].concat(profile.routeTemplates) }); } catch (e) { api.error(e); } },
  kind(e) { this.setData({ kind: e.currentTarget.dataset.value, templateIndex: 0, selected: null, form: emptyForm(), feeIndex: 0 }); },
  template(e) { const index = Number(e.detail.value), route = this.data.templateOptions[index]; if (!route || !route.id) return this.setData({ templateIndex: 0, selected: null, form: emptyForm(), feeIndex: 0 }); const form = Object.assign(emptyForm(), { templateId: route.id, seats: String(route.seats || 1), ownCount: String(route.ownCount || 1), feeMode: route.feeMode || 'free', fixedYuan: yuan(route.fixedFen), rateYuan: route.rateFen ? yuan(route.rateFen) : '0.8', estimatedKm: route.estimatedKm ? String(route.estimatedKm) : '', tollYuan: yuan(route.tollFen), vehicleId: route.vehicleId || '' }); const vehicleIndex = Math.max(0, this.data.profile.vehicles.findIndex(v => v.id === form.vehicleId)); this.setData({ templateIndex: index, selected: route, form, feeIndex: Math.max(0, feeModes.indexOf(form.feeMode)), vehicleIndex }); },
  input(e) { this.setData({ ['form.' + e.currentTarget.dataset.key]: e.detail.value }); },
  fee(e) { const feeIndex = Number(e.detail.value); this.setData({ feeIndex, 'form.feeMode': feeModes[feeIndex] }); },
  student(e) { this.setData({ studentIndex: Number(e.detail.value) }); },
  riderGender(e) { this.setData({ 'form.riderGender': e.currentTarget.dataset.value }); },
  vehicle(e) { const vehicleIndex = Number(e.detail.value), vehicle = this.data.profile.vehicles[vehicleIndex]; this.setData({ vehicleIndex, 'form.vehicleId': vehicle ? vehicle.id : '' }); },
  goTemplates() { wx.switchTab({ url: '/pages/profile/profile' }); },
  async submit() { if (this.data.busy) return; if (!this.data.form.templateId) return api.error(new Error('请先选择常用线路')); this.setData({ busy: true }); try { const f = this.data.form, need = this.data.kind === 'need', student = this.data.profile.students[this.data.studentIndex]; const result = await api.call(need ? 'publishNeed' : 'publish', Object.assign({}, f, { studentId: student && student.id, fixedFen: Math.round(Number(f.fixedYuan || 0) * 100), rateFen: Math.round(Number(f.rateYuan || 0) * 100), tollFen: Math.round(Number(f.tollYuan || 0) * 100) })); if (need) { wx.showToast({ title: '找车需求已发布', icon: 'success' }); wx.switchTab({ url: '/pages/journeys/journeys' }); } else wx.redirectTo({ url: '/pages/detail/detail?id=' + result.id }); } catch (e) { api.error(e); } finally { this.setData({ busy: false }); } }
});
