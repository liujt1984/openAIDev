const api = require('../../services/api');
const feeModes = ['free', 'fixed', 'aa'];
const newTemplate = () => ({ id: '', name: '', direction: 'home', city: '', via: '', meet: '', drop: '', seats: '1', ownCount: '1', feeMode: 'free', fixedYuan: '', rateYuan: '0.8', estimatedKm: '', tollYuan: '0', vehicleId: '' });
const yuan = fen => fen ? (fen / 100).toFixed(2) : '';
Page({
  data: { demo: api.demo, profile: { name: '', phone: '', backup: '', students: [], vehicles: [], routeTemplates: [], favorites: [], blocked: [] }, studentGenders: ['未选择性别', '👦 男孩', '👧 女孩'], templateDraft: newTemplate(), editingTemplate: false, templateFeeIndex: 0, templateVehicleIndex: 0, busy: false, userNames: ['林同学家长 · 搭乘方', '陈同学家长 · 开车方', '黄同学家长 · 另一车主'], userIndex: 0, loading: true },
  onShow() { this.load(); },
  async load() { this.setData({ loading: true }); try { const profile = await api.call('profile'); profile.vehicles = profile.vehicles || (profile.plate ? [{ id: 'legacy-car', name: profile.car || '我的车辆', car: profile.car, plate: profile.plate }] : []); profile.routeTemplates = profile.routeTemplates || []; this.setData({ profile, userIndex: ['parent', 'driver', 'other'].indexOf(api.userId()) }); } catch (e) { api.error(e); } finally { this.setData({ loading: false }); } },
  input(e) { this.setData({ ['profile.' + e.currentTarget.dataset.key]: e.detail.value }); },
  studentInput(e) { this.setData({ ['profile.students[' + e.currentTarget.dataset.index + '].' + e.currentTarget.dataset.key]: e.detail.value }); },
  studentGender(e) { const index = Number(e.currentTarget.dataset.index), gender = ['', 'boy', 'girl'][Number(e.detail.value)]; this.setData({ ['profile.students[' + index + '].gender']: gender }); },
  vehicleInput(e) { this.setData({ ['profile.vehicles[' + e.currentTarget.dataset.index + '].' + e.currentTarget.dataset.key]: e.detail.value }); },
  templateInput(e) { this.setData({ ['templateDraft.' + e.currentTarget.dataset.key]: e.detail.value }); },
  addStudent() { if (this.data.profile.students.length < 6) this.setData({ 'profile.students': this.data.profile.students.concat({ id: '', name: '', grade: '', gender: '' }) }); },
  addVehicle() { if (this.data.profile.vehicles.length < 5) this.setData({ 'profile.vehicles': this.data.profile.vehicles.concat({ id: '', name: '', car: '', plate: '' }) }); },
  removeStudent(e) { const i = Number(e.currentTarget.dataset.index); this.setData({ 'profile.students': this.data.profile.students.filter((_, index) => index !== i) }); },
  removeVehicle(e) { const i = Number(e.currentTarget.dataset.index); this.setData({ 'profile.vehicles': this.data.profile.vehicles.filter((_, index) => index !== i) }); },
  async save() { if (this.data.busy || this.data.loading) return; this.setData({ busy: true }); try { const profile = await api.call('saveProfile', this.data.profile); this.setData({ profile }); wx.showToast({ title: '档案已保存', icon: 'success' }); } catch (e) { api.error(e); } finally { this.setData({ busy: false }); } },
  startTemplate() { this.setData({ editingTemplate: true, templateDraft: newTemplate(), templateFeeIndex: 0, templateVehicleIndex: 0 }); },
  editTemplate(e) { const item = this.data.profile.routeTemplates.find(t => t.id === e.currentTarget.dataset.id); if (!item) return; const draft = Object.assign(newTemplate(), item, { seats: String(item.seats || 1), ownCount: String(item.ownCount || 1), fixedYuan: yuan(item.fixedFen), rateYuan: item.rateFen ? yuan(item.rateFen) : '0.8', estimatedKm: item.estimatedKm ? String(item.estimatedKm) : '', tollYuan: yuan(item.tollFen) }); this.setData({ editingTemplate: true, templateDraft: draft, templateFeeIndex: Math.max(0, feeModes.indexOf(draft.feeMode)), templateVehicleIndex: Math.max(0, this.data.profile.vehicles.findIndex(v => v.id === draft.vehicleId)) }); },
  cancelTemplate() { this.setData({ editingTemplate: false, templateDraft: newTemplate() }); },
  templateDirection(e) { this.setData({ 'templateDraft.direction': e.currentTarget.dataset.value }); },
  templateFee(e) { const i = Number(e.detail.value); this.setData({ templateFeeIndex: i, 'templateDraft.feeMode': feeModes[i] }); },
  templateVehicle(e) { const i = Number(e.detail.value), v = this.data.profile.vehicles[i]; this.setData({ templateVehicleIndex: i, 'templateDraft.vehicleId': v ? v.id : '' }); },
  chooseTemplateLocation(e) { const key = e.currentTarget.dataset.key; wx.chooseLocation({ success: r => this.setData({ ['templateDraft.' + key]: r.name ? r.name + (r.address ? ' · ' + r.address : '') : r.address }), fail: err => { if (!/cancel/.test(err.errMsg || '')) api.error(new Error('未选择地点')); } }); },
  async saveTemplate() { if (this.data.busy) return; this.setData({ busy: true }); try { const d = this.data.templateDraft; const profile = await api.call('saveTemplate', Object.assign({}, d, { fixedFen: Math.round(Number(d.fixedYuan || 0) * 100), rateFen: Math.round(Number(d.rateYuan || 0) * 100), tollFen: Math.round(Number(d.tollYuan || 0) * 100) })); this.setData({ profile, editingTemplate: false, templateDraft: newTemplate() }); wx.showToast({ title: '路线模板已保存', icon: 'success' }); } catch (e) { api.error(e); } finally { this.setData({ busy: false }); } },
  async deleteTemplate(e) { try { if (!await api.confirm('删除这条常用线路？已发布行程不受影响。')) return; const profile = await api.call('deleteTemplate', { templateId: e.currentTarget.dataset.id }); this.setData({ profile }); } catch (err) { api.error(err); } },
  switchUser(e) { api.switchUser(['parent', 'driver', 'other'][Number(e.detail.value)]); this.load(); },
  async reset() { if (await api.confirm('恢复本机演示数据？当前演示记录会被清除。')) { api.reset(); this.load(); } },
  async unblock(e) { try { await api.call('block', { userId: e.currentTarget.dataset.id }); await this.load(); } catch (err) { api.error(err); } },
  async unfavorite(e) { try { await api.call('favorite', { userId: e.currentTarget.dataset.id }); await this.load(); } catch (err) { api.error(err); } }
});
