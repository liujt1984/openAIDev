const { SCHOOL } = require('./domain');
function dateAfter(days) { const d = new Date(Date.now() + days * 86400000 + 8 * 3600000); return d.toISOString().slice(0, 10); }
function seed() {
  const profiles = {
    parent: { id: 'parent', name: '林同学家长', phone: '13800000001', backup: '13800000002', students: [{ id: 's1', name: '林同学', grade: '高一', gender: 'girl' }], plate: '桂A·演示01', car: '白色 SUV', vehicles: [{ id: 'v1', name: '白色 SUV', car: '白色 SUV', plate: '桂A·演示01' }], routeTemplates: [{ id: 'rt1', name: '南宁安吉回家', mode: 'need', direction: 'home', city: '南宁 · 安吉', meet: '武鸣民族高中校外约定点', drop: '安吉客运站附近', feeMode: 'aa', seats: 1, ownCount: 1, fixedFen: 0, rateFen: 0, estimatedKm: 0, tollFen: 0 }], commitments: [], blocked: [], favorites: [], verified: false },
    driver: { id: 'driver', name: '陈同学家长', phone: '13800000003', backup: '13800000004', students: [{ id: 's2', name: '陈同学', grade: '高二', gender: 'boy' }], plate: '桂A·演示02', car: '银色轿车', vehicles: [{ id: 'v2', name: '银色轿车', car: '银色轿车', plate: '桂A·演示02' }], routeTemplates: [{ id: 'rt2', name: '南宁安吉接送', mode: 'drive', direction: 'home', city: '南宁 · 安吉', via: '安吉大道', meet: SCHOOL + '校外约定点', drop: '南宁安吉约定点', feeMode: 'aa', seats: 2, ownCount: 2, fixedFen: 0, rateFen: 80, estimatedKm: 65, tollFen: 0, vehicleId: 'v2' }], commitments: [], blocked: [], favorites: [], verified: false },
    other: { id: 'other', name: '黄同学家长', phone: '13800000005', backup: '', students: [{ id: 's3', name: '黄同学', grade: '高一', gender: 'girl' }], plate: '桂B·演示03', car: '蓝色 SUV', vehicles: [{ id: 'v3', name: '蓝色 SUV', car: '蓝色 SUV', plate: '桂B·演示03' }], routeTemplates: [], commitments: [], blocked: [], favorites: [], verified: false }
  };
  const trips = {};
  [['t1', 'driver', '南宁 · 安吉', 'home', 'aa', 2, 1], ['t2', 'other', '柳州 · 城中', 'home', 'fixed', 1, 1], ['t3', 'driver', '南宁 · 安吉', 'school', 'free', 2, 3]].forEach(([id, uid, city, direction, feeMode, seats, days]) => {
    const p = profiles[uid], date = dateAfter(days), time = direction === 'home' ? '17:30' : '14:00';
    trips[id] = { id, ownerId: uid, ownerName: p.name, direction, city, date, time, departAt: Date.parse(date + 'T' + time + ':00+08:00'), feeMode, seats, ownCount: 2,
      fixedFen: feeMode === 'fixed' ? 6000 : 0, rateFen: feeMode === 'aa' ? 80 : 0, estimatedKm: feeMode === 'aa' ? 65 : 0, tollFen: 0,
      via: direction === 'home' ? '约定区域统一下车' : '从约定集合点出发', meet: direction === 'home' ? SCHOOL + '校外双方约定集合点（演示）' : '安吉客运站附近双方约定点（演示）', drop: direction === 'home' ? city + '双方约定下车点（演示）' : SCHOOL + '校外约定点（演示）',
      phone: p.phone, backup: p.backup, plate: p.plate, car: p.car, note: '演示行程，非真实接送。请勿拨打示例号码。AA 只分摊共同路段，公里成本包含油费，不含过路费。', applications: [], status: 'open', bill: null, createdAt: Date.now() - days * 60000 };
  });
  const date = dateAfter(1);
  const needs = { n1: { id: 'n1', ownerId: 'parent', ownerName: profiles.parent.name, studentId: 's1', studentName: '林同学', studentGender: 'girl', city: '南宁 · 安吉', direction: 'home', date, time: '17:30', departAt: Date.parse(date + 'T17:30:00+08:00'), feeMode: 'aa', status: 'open', createdAt: Date.now() } };
  return { profiles, trips, needs, reports: {} };
}
module.exports = { seed, dateAfter };
