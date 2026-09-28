const api = require('../../services/api');
function route(direction, city) { return direction === 'home' ? '武鸣民族高中 → ' + city : city + ' → 武鸣民族高中'; }
Page({
  data: { items: [], profile: { routeTemplates: [] }, view: 'active', filtered: [], loading: true, error: '', activeCount: 0 },
  onShow() { this.load(); },
  async onPullDownRefresh() { await this.load(); wx.stopPullDownRefresh(); },
  async load() {
    this.setData({ loading: true, error: '' });
    try {
      const [mine, profile] = await Promise.all([api.call('mine'), api.call('profile')]);
      const trips = mine.trips.map(t => {
        const apps = t.applications || [];
        const caption = t.status === 'completed' ? '已完成' : t.status === 'cancelled' ? '已取消' : t.isOwner ? '🚗 我开车 · 余 ' + t.remaining + ' 座' + (t.riderGender && t.riderGender !== 'any' ? ' · ' + t.riderGenderLabel : '') : (apps.map(a => a.studentName + ' · ' + a.statusLabel).join(' / ') || '等待车主确认');
        return Object.assign(t, { itemType: 'trip', routeText: t.from + ' → ' + t.to, caption, active: t.status === 'open' });
      });
      const needs = mine.needs.map(n => Object.assign(n, { itemType: 'need', routeText: route(n.direction, n.city), feeLabel: n.feeMode === 'aa' ? '按公里 AA' : n.feeMode === 'fixed' ? '固定费用' : '免费互助', caption: n.status === 'open' ? '🧒 ' + n.studentName + ' · 正在找顺路车辆' : n.status === 'matched' ? '🧒 ' + n.studentName + ' · 已匹配，等待接送' : '🧒 ' + n.studentName + ' · 已关闭', active: ['open', 'matched'].includes(n.status) }));
      const items = trips.concat(needs).sort((a, b) => String(a.date + a.time).localeCompare(String(b.date + b.time)));
      this.setData({ items, profile, activeCount: items.filter(i => i.active).length }); this.filter();
    } catch (e) { this.setData({ error: e.message }); } finally { this.setData({ loading: false }); }
  },
  filter() { const items = this.data.items; const filtered = this.data.view === 'drive' ? items.filter(i => i.itemType === 'trip' && i.isOwner) : this.data.view === 'ride' ? items.filter(i => i.itemType === 'need' || (i.itemType === 'trip' && !i.isOwner)) : this.data.view === 'history' ? items.filter(i => !i.active) : items.filter(i => i.active); this.setData({ filtered }); },
  tab(e) { this.setData({ view: e.currentTarget.dataset.value }); this.filter(); },
  open(e) { if (e.currentTarget.dataset.type === 'need') return; wx.navigateTo({ url: '/pages/detail/detail?id=' + e.currentTarget.dataset.id }); },
  publish() { wx.switchTab({ url: '/pages/publish/publish' }); },
  async closeNeed(e) { try { if (!await api.confirm('关闭这条找车需求？')) return; await api.call('closeNeed', { needId: e.currentTarget.dataset.id }); this.load(); } catch (err) { api.error(err); } }
});
