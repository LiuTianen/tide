'use strict';

// ============================================================
// 潮汐 (Tide) — 同步引擎
// ============================================================

var Tide = window.Tide || {};
window.Tide = Tide;

/**
 * 从服务器拉取变更
 * @returns {Promise}
 */
Tide.syncPull = async function() {
  try {
    const localVersion = await Tide.getLocalVersion();
    const data = await Tide.apiGet('/sync?since_version=' + localVersion);

    if (!data || !data.changes || !data.changes.length) {
      return;
    }

    const changes = data.changes;
    const latestVersion = data.version || localVersion;

    for (let i = 0; i < changes.length; i++) {
      const ch = changes[i];
      const storeName = ch.table || 'transactions';
      if (ch.action === 'delete') {
        await Tide.dbDelete(storeName, ch.data.id);
      } else {
        // insert or update
        await Tide.dbPut(storeName, ch.data);
      }
    }

    await Tide.setLocalVersion(latestVersion);
  } catch (err) {
    console.error('syncPull failed:', err);
    Tide.toast && Tide.toast('同步拉取失败');
    throw err;
  }
};

/**
 * 推送本地未同步的数据到服务器
 * @returns {Promise}
 */
Tide.syncPush = async function() {
  try {
    const unsynced = await Tide.getUnsyncedTx();

    if (!unsynced.length) return;

    const syncedIds = [];

    for (let i = 0; i < unsynced.length; i++) {
      const tx = unsynced[i];

      try {
        if (tx._deleted) {
          // 删除
          await Tide.apiDelete('/transactions/' + tx.id);
          await Tide.dbDelete('transactions', tx.id);
          syncedIds.push(tx.id);
        } else if (tx._is_new) {
          // 新建
          const body = Object.assign({}, tx);
          delete body._synced;
          delete body._is_new;
          delete body._deleted;
          const result = await Tide.apiPost('/transactions', body);
          // 用服务器返回的 id 更新本地
          if (result && result.id) {
            await Tide.dbDelete('transactions', tx.id);
            result._synced = 1;
            await Tide.dbPut('transactions', result);
          } else {
            await Tide.markSynced([tx.id]);
          }
          syncedIds.push(tx.id);
        } else {
          // 更新
          const body = Object.assign({}, tx);
          delete body._synced;
          delete body._is_new;
          delete body._deleted;
          await Tide.apiPut('/transactions/' + tx.id, body);
          syncedIds.push(tx.id);
        }
      } catch (err) {
        console.error('syncPush item failed:', tx.id, err);
        // 继续推送其他记录
      }
    }

    // 标记成功推送的
    const stillLocal = await Tide.dbGetAll('transactions', function(t) {
      return syncedIds.indexOf(t.id) !== -1 && t._synced !== 1;
    });
    if (stillLocal.length) {
      await Tide.markSynced(syncedIds);
    }
  } catch (err) {
    console.error('syncPush failed:', err);
    Tide.toast && Tide.toast('同步推送失败');
    throw err;
  }
};

/**
 * 完整同步：先推后拉
 * @returns {Promise}
 */
Tide.fullSync = async function() {
  Tide.toast && Tide.toast('正在同步...');
  try {
    await Tide.syncPush();
    await Tide.syncPull();
    Tide.toast && Tide.toast('同步完成');
  } catch (err) {
    // toast 已在子函数中处理
  }
};
