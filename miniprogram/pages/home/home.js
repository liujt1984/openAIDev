const api = require('../../services/api');
Page({
  data: { demo: api.demo, loading: true, error: '', view: 'trips', direction: 'home', city: '', date: '', fee: '', feeNames: ['所有费用', '免费互助', '固定费用', '公里 AA'], feeIndex: 0, childGenders: ['孩子性别不限', '👦 我家男孩', '👧 我家女孩'], childGenderIndex: 0, childGender: '', trips: [], needs: [], filteredTrips: [], filteredNeeds: [] },
  onShow() { this.load(); },
  async load() { this.setData({ loading: true, error: '' }); try { const result = await api.call('list'); this.setData(result); this.filter(); } catch (e) { this.setData({ error: e.message }); } finally { this.setData({ loading: false }); } },
  async onPullDownRefresh() { await this.load(); wx.stopPullDownRefresh(); },
  setView(e) { this.setData({ view: e.currentTarget.dataset.value }); },
  setDirection(e) { this.setData({ direction: e.currentTarget.dataset.value }); this.filter(); },
  setCity(e) { this.setData({ city: e.detail.value }); this.filter(); },
  setDate(e) { this.setData({ date: e.detail.value }); this.filter(); },
  setFee(e) { const feeIndex = Number(e.detail.value); this.setData({ feeIndex, fee: ['', 'free', 'fixed', 'aa'][feeIndex] }); this.filter(); },
  setGender(e) { const childGenderIndex = Number(e.detail.value); this.setData({ childGenderIndex, childGender: ['', 'boy', 'girl'][childGenderIndex] }); this.filter(); },
  resetFilters() { this.setData({ city: '', date: '', fee: '', feeIndex: 0, childGender: '', childGenderIndex: 0 }); this.filter(); },
  filter() { const d = this.data; const match = x => x.direction === d.direction && (!d.city || (x.city + (x.via || '')).includes(d.city.trim())) && (!d.date || x.date === d.date) && (!d.fee || x.feeMode === d.fee) && (!d.childGender || !x.riderGender || x.riderGender === 'any' || x.riderGender === d.childGender); this.setData({ filteredTrips: d.trips.filter(match), filteredNeeds: d.needs.filter(match) }); },
  open(e) { wx.navigateTo({ url: '/pages/detail/detail?id=' + e.currentTarget.dataset.id }); },
  publish() { wx.switchTab({ url: '/pages/publish/publish' }); },
  async invite(e) {
    try {
      const needId = e.currentTarget.dataset.id, need = this.data.needs.find(n => n.id === needId);
      const mine = await api.call('mine');
      const genderOk = t => !t.riderGender || t.riderGender === 'any' || (t.riderGender === 'girl' ? need.studentGenderLabel === '女生' : t.riderGender === 'boy' ? need.studentGenderLabel === '男生' : false);
      const trips = mine.trips.filter(t => t.isOwner && t.status === 'open' && t.remaining > 0 && t.date === need.date && t.direction === need.direction && genderOk(t));
      if (!trips.length) throw new Error('请先发布同日期、同方向且符合学生性别要求的驾车行程');
      const options = trips.slice(0, 6);
      wx.showActionSheet({ itemList: options.map(t => t.time + ' ' + t.city), success: async r => {
        try { if (!await api.confirm('请确认上下车区域顺路。邀请不占座，对方接受后才确认搭乘。')) return; await api.call('invite', { tripId: options[r.tapIndex].id, needId }); wx.showToast({ title: '邀请已记录', icon: 'success' }); } catch (err) { api.error(err); }
      } });
    } catch (e2) { api.error(e2); }
  }
});
