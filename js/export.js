'use strict';

// ============================================================
// 潮汐 (Tide) — 导入/导出逻辑
// ============================================================

var Tide = window.Tide || {};
window.Tide = Tide;

Tide.Export = {
  /**
   * 导出 CSV 文件（从 IndexedDB 生成）
   */
  exportCSV: function() {
    const self = this;
    Tide.dbGetAll('transactions', function(tx) { return !tx._deleted; }).then(function(txs) {
      if (!txs.length) {
        Tide.toast('没有可导出的数据');
        return;
      }

      txs.sort(function(a, b) {
        return (a.date || '').localeCompare(b.date || '');
      });

      // CSV 头
      const headers = ['日期', '类型', '分类', '金额', '备注'];
      const rows = [headers.join(',')];

      txs.forEach(function(tx) {
        const type = tx.type === 'expense' ? '支出' : '收入';
        const amount = tx.type === 'expense' ? -tx.amount : tx.amount;
        const row = [
          tx.date || '',
          type,
          '"' + (tx.category_name || '').replace(/"/g, '""') + '"',
          amount.toFixed(2),
          '"' + (tx.note || '').replace(/"/g, '""') + '"'
        ];
        rows.push(row.join(','));
      });

      const csv = rows.join('\n');
      self._downloadBlob(csv, 'text/csv;charset=utf-8', 'tide_export.csv');
      Tide.toast('CSV 已导出');
    }).catch(function(err) {
      Tide.toast('导出失败');
    });
  },

  /**
   * 导出 JSON 文件（从 IndexedDB 生成）
   */
  exportJSON: function() {
    const self = this;
    Tide.dbGetAll('transactions', function(tx) { return !tx._deleted; }).then(function(txs) {
      if (!txs.length) {
        Tide.toast('没有可导出的数据');
        return;
      }

      // 清理内部字段
      const clean = txs.map(function(tx) {
        const o = Object.assign({}, tx);
        delete o._synced;
        delete o._is_new;
        delete o._deleted;
        return o;
      });

      clean.sort(function(a, b) {
        return (a.date || '').localeCompare(b.date || '');
      });

      const json = JSON.stringify(clean, null, 2);
      self._downloadBlob(json, 'application/json', 'tide_export.json');
      Tide.toast('JSON 已导出');
    }).catch(function(err) {
      Tide.toast('导出失败');
    });
  },

  /**
   * 导入 CSV 文件
   * @param {File} file
   */
  importCSV: async function(file) {
    const self = this;

    try {
      const text = await self._readFile(file);
      const lines = text.split(/\r?\n/).filter(function(l) { return l.trim(); });

      if (lines.length < 2) {
        Tide.toast('CSV 文件为空');
        return;
      }

      // 跳过头行
      const dataLines = lines.slice(1);
      const transactions = [];

      dataLines.forEach(function(line, idx) {
        // 简单 CSV 解析（支持双引号转义）
        const cols = self._parseCSVLine(line);
        if (cols.length < 4) return;

        const date = (cols[0] || '').trim();
        const typeStr = (cols[1] || '').trim();
        const category = (cols[2] || '').trim();
        const amountStr = (cols[3] || '').trim();
        const note = (cols[4] || '').trim();

        const amount = parseFloat(amountStr);
        if (isNaN(amount) || !date) return;

        const tx = {
          id: 'import_' + Date.now() + '_' + idx,
          date: date,
          type: typeStr === '支出' ? 'expense' : 'income',
          category_name: category,
          category_emoji: '💰',
          category_id: null,
          amount: Math.abs(amount),
          note: note,
          tags: [],
          _synced: 0,
          _is_new: true
        };
        transactions.push(tx);
      });

      if (!transactions.length) {
        Tide.toast('未解析到有效记录');
        return;
      }

      if (!confirm('即将导入 ' + transactions.length + ' 条记录，确定继续？')) {
        return;
      }

      // 批量存入 IndexedDB
      await Tide.dbPutBatch('transactions', transactions);

      // 尝试同步到服务器
      try {
        await Tide.syncPush();
      } catch (e) {
        // 离线场景
      }

      Tide.toast('成功导入 ' + transactions.length + ' 条记录');
    } catch (err) {
      Tide.toast('导入失败: ' + (err.message || '未知错误'));
    }
  },

  /**
   * 读取文件为文本
   */
  _readFile: function(file) {
    return new Promise(function(resolve, reject) {
      const reader = new FileReader();
      reader.onload = function(e) { resolve(e.target.result); };
      reader.onerror = function(e) { reject(e.target.error); };
      reader.readAsText(file, 'utf-8');
    });
  },

  /**
   * 触发下载 Blob
   */
  _downloadBlob: function(content, mimeType, filename) {
    const blob = new Blob(['\uFEFF' + content], { type: mimeType }); // BOM for CSV
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },

  /**
   * 简易 CSV 行解析
   */
  _parseCSVLine: function(line) {
    const result = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"') {
          if (i + 1 < line.length && line[i + 1] === '"') {
            current += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          current += ch;
        }
      } else {
        if (ch === '"') {
          inQuotes = true;
        } else if (ch === ',') {
          result.push(current);
          current = '';
        } else {
          current += ch;
        }
      }
    }
    result.push(current);
    return result;
  }
};
