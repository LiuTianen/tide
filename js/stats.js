'use strict';

// ============================================================
// 潮汐 (Tide) — 统计页
// ============================================================

const Tide = window.Tide || {};
window.Tide = Tide;

Tide.Stats = {
  _month: null,
  _chartType: 'expense', // 'expense' | 'income'
  _chartCanvas: null,

  render: function() {
    const main = document.querySelector('#main');
    if (!main) return;
    main.innerHTML = '';
    main.className = 'stats-page';

    const self = this;
    const now = new Date();
    if (!self._month) {
      self._month = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
    }

    // --- 月份选择器 ---
    const monthSelect = document.createElement('div');
    monthSelect.className = 'month-select';

    const btnPrev = document.createElement('button');
    btnPrev.textContent = '←';
    monthSelect.appendChild(btnPrev);

    const monthLabel = document.createElement('span');
    monthLabel.className = 'month-label';
    monthLabel.textContent = self._formatMonth(self._month);
    monthSelect.appendChild(monthLabel);

    const btnNext = document.createElement('button');
    btnNext.textContent = '→';
    monthSelect.appendChild(btnNext);

    main.appendChild(monthSelect);

    // --- 汇总卡片 ---
    const summary = document.createElement('div');
    summary.className = 'summary';
    summary.id = 'stats-summary';
    main.appendChild(summary);

    // --- 图表区 ---
    const chartWrap = document.createElement('div');
    chartWrap.className = 'chart-wrap';
    chartWrap.id = 'chart-wrap';
    main.appendChild(chartWrap);

    // --- 分类明细 ---
    const catList = document.createElement('div');
    catList.className = 'cat-list';
    catList.id = 'cat-list';
    main.appendChild(catList);

    // --- 切换按钮 ---
    const toggleDiv = document.createElement('div');
    toggleDiv.style.cssText = 'text-align: center; margin-top: 12px;';
    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'btn btn-outline';
    toggleBtn.textContent = self._chartType === 'expense' ? '查看收入饼图' : '查看支出饼图';
    toggleBtn.addEventListener('click', function() {
      self._chartType = self._chartType === 'expense' ? 'income' : 'expense';
      toggleBtn.textContent = self._chartType === 'expense' ? '查看收入饼图' : '查看支出饼图';
      self._loadAndRender();
    });
    toggleDiv.appendChild(toggleBtn);
    main.appendChild(toggleDiv);

    // 事件
    btnPrev.addEventListener('click', function() {
      self._changeMonth(-1);
      self.render();
    });
    btnNext.addEventListener('click', function() {
      self._changeMonth(1);
      self.render();
    });

    // 加载数据
    this._loadAndRender();
  },

  _formatMonth: function(ym) {
    const parts = ym.split('-');
    return parts[0] + '年' + parseInt(parts[1], 10) + '月';
  },

  _changeMonth: function(delta) {
    const parts = this._month.split('-');
    const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1 + delta, 1);
    this._month = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  },

  _loadAndRender: function() {
    const self = this;
    const ym = self._month;
    const [year, month] = ym.split('-').map(Number);
    const prefix = ym + '-';
    const nextMonth = month === 12 ? (year + 1) + '-01' : year + '-' + String(month + 1).padStart(2, '0');

    Tide.dbGetAll('transactions', function(tx) {
      return tx.date >= prefix && tx.date < nextMonth && !tx._deleted;
    }).then(function(txs) {
      self._renderStats(txs);
    });
  },

  _renderStats: function(txs) {
    const self = this;

    // 按类型汇总
    let totalExpense = 0;
    let totalIncome = 0;
    const catExpense = {}; // category_name → { amount, emoji }
    const catIncome = {};

    txs.forEach(function(tx) {
      if (tx.type === 'expense') {
        totalExpense += tx.amount;
        if (!catExpense[tx.category_name]) {
          catExpense[tx.category_name] = { amount: 0, emoji: tx.category_emoji || '💰' };
        }
        catExpense[tx.category_name].amount += tx.amount;
      } else {
        totalIncome += tx.amount;
        if (!catIncome[tx.category_name]) {
          catIncome[tx.category_name] = { amount: 0, emoji: tx.category_emoji || '💰' };
        }
        catIncome[tx.category_name].amount += tx.amount;
      }
    });

    // --- 渲染汇总卡片 ---
    const summary = document.querySelector('#stats-summary');
    if (summary) {
      summary.innerHTML = '';

      const expCard = document.createElement('div');
      expCard.className = 'summary-card';
      expCard.innerHTML = '<div class="label">支出</div><div class="value amount-expense">¥' + totalExpense.toFixed(2) + '</div>';
      summary.appendChild(expCard);

      const incCard = document.createElement('div');
      incCard.className = 'summary-card';
      incCard.innerHTML = '<div class="label">收入</div><div class="value amount-income">¥' + totalIncome.toFixed(2) + '</div>';
      summary.appendChild(incCard);
    }

    // --- 渲染饼图 ---
    const chartWrap = document.querySelector('#chart-wrap');
    if (chartWrap) {
      chartWrap.innerHTML = '';
      const canvas = document.createElement('canvas');
      canvas.width = 240;
      canvas.height = 240;
      canvas.style.cssText = 'width: 240px; height: 240px; display: block; margin: 0 auto;';
      chartWrap.appendChild(canvas);

      const data = self._chartType === 'expense' ? catExpense : catIncome;
      const total = self._chartType === 'expense' ? totalExpense : totalIncome;
      self._drawPieChart(canvas, data, total);
    }

    // --- 渲染分类明细 ---
    const catList = document.querySelector('#cat-list');
    if (catList) {
      catList.innerHTML = '';

      const data = self._chartType === 'expense' ? catExpense : catIncome;
      const total = self._chartType === 'expense' ? totalExpense : totalIncome;
      const entries = Object.entries(data).sort(function(a, b) {
        return b[1].amount - a[1].amount;
      });

      entries.forEach(function(entry) {
        const name = entry[0];
        const info = entry[1];
        const pct = total > 0 ? (info.amount / total * 100) : 0;

        const row = document.createElement('div');
        row.className = 'cat-row';

        const emojiSpan = document.createElement('span');
        emojiSpan.textContent = info.emoji || '💰';
        emojiSpan.style.cssText = 'margin-right: 8px;';
        row.appendChild(emojiSpan);

        const nameSpan = document.createElement('span');
        nameSpan.textContent = name;
        nameSpan.style.cssText = 'flex: 1;';
        row.appendChild(nameSpan);

        const amountSpan = document.createElement('span');
        amountSpan.textContent = '¥' + info.amount.toFixed(2);
        amountSpan.style.cssText = 'margin-right: 8px;';
        row.appendChild(amountSpan);

        const pctSpan = document.createElement('span');
        pctSpan.textContent = pct.toFixed(1) + '%';
        pctSpan.style.cssText = 'margin-right: 8px; font-size: 12px; color: #777;';
        row.appendChild(pctSpan);

        const bar = document.createElement('div');
        bar.className = 'bar';
        const barFill = document.createElement('div');
        barFill.className = 'bar-fill';
        barFill.style.width = pct + '%';
        bar.appendChild(barFill);
        row.appendChild(bar);

        catList.appendChild(row);
      });

      if (!entries.length) {
        const empty = document.createElement('div');
        empty.className = 'empty-state';
        empty.innerHTML = '<div class="icon">📊</div><p>暂无数据</p>';
        catList.appendChild(empty);
      }
    }
  },

  _drawPieChart: function(canvas, data, total) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    const cx = w / 2;
    const cy = h / 2;
    const radius = Math.min(w, h) / 2 - 15;

    ctx.clearRect(0, 0, w, h);

    if (total <= 0 || Object.keys(data).length === 0) {
      // 空饼图
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fillStyle = '#2a2a2a';
      ctx.fill();
      ctx.fillStyle = '#777';
      ctx.font = '14px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('暂无数据', cx, cy);
      return;
    }

    // 暖金色系颜色
    const colors = [
      '#c9a96e', '#d4b87a', '#bf9a5e', '#e0c78e',
      '#b08d52', '#d9c28a', '#a67c45', '#c4a36a',
      '#e8d49c', '#ba9658', '#d0b476', '#9e743d'
    ];

    const entries = Object.entries(data).sort(function(a, b) {
      return b[1].amount - a[1].amount;
    });

    let startAngle = -Math.PI / 2; // 从顶部开始

    entries.forEach(function(entry, idx) {
      const info = entry[1];
      const sliceAngle = (info.amount / total) * Math.PI * 2;

      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, radius, startAngle, startAngle + sliceAngle);
      ctx.closePath();
      ctx.fillStyle = colors[idx % colors.length];
      ctx.fill();

      // 边框
      ctx.strokeStyle = '#141414';
      ctx.lineWidth = 2;
      ctx.stroke();

      startAngle += sliceAngle;
    });

    // 中心圆孔（甜甜圈效果）
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 0.55, 0, Math.PI * 2);
    ctx.fillStyle = '#141414';
    ctx.fill();

    // 中心文字
    ctx.fillStyle = '#c9a96e';
    ctx.font = 'bold 18px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('¥' + total.toFixed(2), cx, cy);
  }
};
