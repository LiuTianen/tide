'use strict';

// ============================================================
// 潮汐 (Tide) — IndexedDB 封装
// ============================================================

var Tide = window.Tide || {};
window.Tide = Tide;

const DB_NAME = 'tide';
const DB_VERSION = 5;

let _db = null;

/**
 * 打开数据库并确保 stores 存在
 * @returns {Promise<IDBDatabase>}
 */
Tide.openDB = function() {
  if (_db) return Promise.resolve(_db);

  return new Promise(function(resolve, reject) {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = function(e) {
      const db = e.target.result;

      if (!db.objectStoreNames.contains('transactions')) {
        const txStore = db.createObjectStore('transactions', { keyPath: 'id' });
        txStore.createIndex('by_synced', '_synced', { unique: false });
        txStore.createIndex('by_date', 'date', { unique: false });
      }

      if (!db.objectStoreNames.contains('categories')) {
        db.createObjectStore('categories', { keyPath: 'id' });
      }

      if (!db.objectStoreNames.contains('sync_meta')) {
        db.createObjectStore('sync_meta', { keyPath: 'key' });
      }
    };

    req.onsuccess = function(e) {
      _db = e.target.result;
      resolve(_db);
    };

    req.onerror = function(e) {
      reject(e.target.error);
    };
  });
};

/**
 * 插入/更新单条记录
 * @param {string} storeName
 * @param {object} obj
 * @returns {Promise}
 */
Tide.dbPut = function(storeName, obj) {
  return Tide.openDB().then(function(db) {
    return new Promise(function(resolve, reject) {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const req = store.put(obj);
      req.onsuccess = function() { resolve(req.result); };
      req.onerror = function() { reject(req.error); };
    });
  });
};

/**
 * 批量插入/更新
 * @param {string} storeName
 * @param {Array} objs
 * @returns {Promise}
 */
Tide.dbPutBatch = function(storeName, objs) {
  return Tide.openDB().then(function(db) {
    return new Promise(function(resolve, reject) {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      objs.forEach(function(obj) { store.put(obj); });
      tx.oncomplete = function() { resolve(); };
      tx.onerror = function() { reject(tx.error); };
    });
  });
};

/**
 * 获取全部记录（可选过滤）
 * @param {string} storeName
 * @param {Function} [filterFn]
 * @returns {Promise<Array>}
 */
Tide.dbGetAll = function(storeName, filterFn) {
  return Tide.openDB().then(function(db) {
    return new Promise(function(resolve, reject) {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const req = store.getAll();
      req.onsuccess = function() {
        const results = req.result || [];
        resolve(filterFn ? results.filter(filterFn) : results);
      };
      req.onerror = function() { reject(req.error); };
    });
  });
};

/**
 * 获取单条记录
 * @param {string} storeName
 * @param {*} id
 * @returns {Promise<object|undefined>}
 */
Tide.dbGet = function(storeName, id) {
  return Tide.openDB().then(function(db) {
    return new Promise(function(resolve, reject) {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const req = store.get(id);
      req.onsuccess = function() { resolve(req.result); };
      req.onerror = function() { reject(req.error); };
    });
  });
};

/**
 * 删除记录
 * @param {string} storeName
 * @param {*} id
 * @returns {Promise}
 */
Tide.dbDelete = function(storeName, id) {
  return Tide.openDB().then(function(db) {
    return new Promise(function(resolve, reject) {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const req = store.delete(id);
      req.onsuccess = function() { resolve(); };
      req.onerror = function() { reject(req.error); };
    });
  });
};

/**
 * 获取未同步的交易
 * @returns {Promise<Array>}
 */
Tide.getUnsyncedTx = function() {
  return Tide.dbGetAll('transactions', function(tx) {
    return tx._synced !== 1;
  });
};

/**
 * 标记已同步
 * @param {Array} ids
 * @returns {Promise}
 */
Tide.markSynced = function(ids) {
  return Tide.openDB().then(function(db) {
    return new Promise(function(resolve, reject) {
      const tx = db.transaction('transactions', 'readwrite');
      const store = tx.objectStore('transactions');
      const promises = ids.map(function(id) {
        return new Promise(function(res, rej) {
          const getReq = store.get(id);
          getReq.onsuccess = function() {
            const record = getReq.result;
            if (record) {
              record._synced = 1;
              store.put(record);
            }
            res();
          };
          getReq.onerror = function() { rej(getReq.error); };
        });
      });
      Promise.all(promises).then(function() { resolve(); }).catch(reject);
      tx.oncomplete = function() { resolve(); };
    });
  });
};

/**
 * 获取本地版本号
 * @returns {Promise<number>}
 */
Tide.getLocalVersion = function() {
  return Tide.dbGet('sync_meta', 'version').then(function(meta) {
    return meta ? meta.value : 0;
  });
};

/**
 * 设置本地版本号
 * @param {number} v
 * @returns {Promise}
 */
Tide.setLocalVersion = function(v) {
  return Tide.dbPut('sync_meta', { key: 'version', value: v });
};
