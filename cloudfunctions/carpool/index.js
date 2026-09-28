const cloud = require('wx-server-sdk');
const { execute } = require('./domain');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const READ = new Set(['profile', 'list', 'mine', 'detail']);
const COLLECTIONS = ['profiles', 'trips', 'needs', 'reports'];
function repository(handle, uid, action) {
  const cache = new Map();
  return {
    async get(table, id) {
      if (!COLLECTIONS.includes(table)) throw new Error('Unknown collection');
      const key = table + '/' + id;
      if (cache.has(key)) return JSON.parse(JSON.stringify(cache.get(key)));
      try { const result = await handle.collection(table).doc(id).get(); const value = result.data || null; cache.set(key, value); return value; }
      catch (e) {
        const message = e.message || e.errMsg || '';
        // Missing collections/permissions are deployment failures, not empty profiles.
        if (/collection|集合/i.test(message)) throw e;
        if (/document.*(?:not exist|not found)|(?:not exist|not found).*document|文档不存在/i.test(message)) return null;
        throw e;
      }
    },
    async list(table) {
      // Lists are read-only. Paginate internally instead of silently truncating at the SDK default.
      const base = db.collection(table);
      const command = db.command;
      let query = base;
      if (action === 'list') query = base.where({ status: 'open', departAt: command.gt(Date.now()) });
      if (action === 'mine') query = table === 'trips'
        ? base.where(command.or([{ ownerId: uid }, { 'applications.parentId': uid }]))
        : base.where({ ownerId: uid });
      const rows = [];
      for (let skip = 0; ; skip += 100) {
        const result = await query.orderBy('createdAt', 'desc').skip(skip).limit(100).get();
        rows.push(...result.data); if (result.data.length < 100) break;
      }
      return rows;
    },
    async put(table, id, doc) {
      const data = Object.assign({}, doc); delete data._id; delete data._openid;
      cache.set(table + '/' + id, JSON.parse(JSON.stringify(data)));
      await handle.collection(table).doc(id).set({ data });
    }
  };
}
exports.main = async (event = {}) => {
  const uid = cloud.getWXContext().OPENID;
  if (!uid) return { ok: false, message: '无法识别微信身份' };
  try {
    const action = event.action, data = event.data || {};
    if (action === 'health') {
      const collections = {};
      for (const table of COLLECTIONS) {
        await db.collection(table).limit(1).get();
        collections[table] = 'ready';
      }
      return { ok: true, data: { service: 'carpool', version: '0.1.0', authenticated: true, collections, serverTime: Date.now() } };
    }
    const result = READ.has(action)
      ? await execute(repository(db, uid, action), uid, action, data)
      : await db.runTransaction(async tx => execute(repository(tx, uid, action), uid, action, data));
    return { ok: true, data: result };
  } catch (e) {
    if (e.code !== 'BUSINESS_ERROR') console.error('carpool failure', e.code || 'internal', e.message);
    return { ok: false, message: e.code === 'BUSINESS_ERROR' ? e.message : '服务暂时不可用，请稍后重试' };
  }
};
