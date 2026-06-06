'use strict';

// ============================================================
// 潮汐 (Tide) — 设置页
// ============================================================

var Tide = window.Tide || {};
window.Tide = Tide;

Tide.Settings = {
  render: function() {
    const main = document.querySelector('#main');
    if (!main) return;
    main.innerHTML = '';
    main.className = 'settings-page';

    const self = this;

    // ========== 账户 ==========
    const secAccount = document.createElement('div');
    secAccount.className = 'section';

    const secTitle1 = document.createElement('div');
    secTitle1.className = 'section-title';
    secTitle1.textContent = '账户';
    secAccount.appendChild(secTitle1);

    // 用户名
    const rowUser = document.createElement('div');
    rowUser.className = 'setting-row';
    rowUser.innerHTML = '<span>用户名</span><span>' + (Tide.currentUser || '未知') + '</span>';
    secAccount.appendChild(rowUser);

    // 同步状态
    const rowSync = document.createElement('div');
    rowSync.className = 'setting-row';
    rowSync.style.cssText = 'flex-wrap: wrap;';

    const syncLabel = document.createElement('span');
    syncLabel.textContent = '数据同步';
    rowSync.appendChild(syncLabel);

    const syncInfo = document.createElement('span');
    syncInfo.id = 'sync-info';
    syncInfo.style.cssText = 'font-size: 12px; color: #777; margin-left: auto;';
    self._updateSyncInfo(syncInfo);
    rowSync.appendChild(syncInfo);

    const syncBtn = document.createElement('button');
    syncBtn.className = 'btn btn-outline';
    syncBtn.textContent = '手动同步';
    syncBtn.style.cssText = 'width: 100%; margin-top: 8px;';
    syncBtn.addEventListener('click', function() {
      Tide.fullSync().then(function() {
        self._updateSyncInfo(syncInfo);
      });
    });
    rowSync.appendChild(syncBtn);

    secAccount.appendChild(rowSync);

    main.appendChild(secAccount);

    // ========== 数据 ==========
    const secData = document.createElement('div');
    secData.className = 'section';

    const secTitle2 = document.createElement('div');
    secTitle2.className = 'section-title';
    secTitle2.textContent = '数据';
    secData.appendChild(secTitle2);

    // 导出 CSV
    const rowExportCsv = document.createElement('div');
    rowExportCsv.className = 'setting-row';
    rowExportCsv.innerHTML = '<span>导出 CSV</span>';
    const btnCsv = document.createElement('button');
    btnCsv.className = 'btn btn-outline';
    btnCsv.textContent = '导出';
    btnCsv.addEventListener('click', function() {
      Tide.Export && Tide.Export.exportCSV();
    });
    rowExportCsv.appendChild(btnCsv);
    secData.appendChild(rowExportCsv);

    // 导出 JSON
    const rowExportJson = document.createElement('div');
    rowExportJson.className = 'setting-row';
    rowExportJson.innerHTML = '<span>导出 JSON</span>';
    const btnJson = document.createElement('button');
    btnJson.className = 'btn btn-outline';
    btnJson.textContent = '导出';
    btnJson.addEventListener('click', function() {
      Tide.Export && Tide.Export.exportJSON();
    });
    rowExportJson.appendChild(btnJson);
    secData.appendChild(rowExportJson);

    // 导入 CSV
    const rowImport = document.createElement('div');
    rowImport.className = 'setting-row';
    rowImport.style.cssText = 'flex-wrap: wrap;';
    rowImport.innerHTML = '<span>导入 CSV</span>';

    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.csv';
    fileInput.style.cssText = 'display: none;';
    rowImport.appendChild(fileInput);

    const importBtn = document.createElement('button');
    importBtn.className = 'btn btn-outline';
    importBtn.textContent = '选择文件';
    importBtn.addEventListener('click', function() { fileInput.click(); });
    rowImport.appendChild(importBtn);

    fileInput.addEventListener('change', function() {
      if (fileInput.files && fileInput.files[0]) {
        Tide.Export && Tide.Export.importCSV(fileInput.files[0]);
        fileInput.value = '';
      }
    });

    secData.appendChild(rowImport);

    main.appendChild(secData);

    // ========== 分类管理 ==========
    const secCat = document.createElement('div');
    secCat.className = 'section';
    Tide.Categories && Tide.Categories.renderManager(secCat);
    main.appendChild(secCat);

    // ========== 其他 ==========
    const secOther = document.createElement('div');
    secOther.className = 'section';

    const secTitle3 = document.createElement('div');
    secTitle3.className = 'section-title';
    secTitle3.textContent = '其他';
    secOther.appendChild(secTitle3);

    const rowLogout = document.createElement('div');
    rowLogout.className = 'setting-row';
    const logoutBtn = document.createElement('button');
    logoutBtn.className = 'btn btn-outline btn-block';
    logoutBtn.textContent = '退出登录';
    logoutBtn.style.cssText = 'color: #ff6b6b; border-color: #ff6b6b;';
    logoutBtn.addEventListener('click', function() {
      self._logout();
    });
    rowLogout.appendChild(logoutBtn);
    secOther.appendChild(rowLogout);

    main.appendChild(secOther);
  },

  _updateSyncInfo: function(el) {
    if (!el) return;
    Tide.getLocalVersion().then(function(v) {
      const time = new Date().toLocaleString();
      el.textContent = '上次同步: ' + time + ' (v' + v + ')';
    });
  },

  _logout: function() {
    if (!confirm('确定退出登录？本地数据将被清除。')) return;

    // 清空 IndexedDB
    indexedDB.deleteDatabase('tide');

    // 清空 token
    Tide.clearToken();

    Tide.toast('已退出登录');
    Router.go('login');
  }
};
