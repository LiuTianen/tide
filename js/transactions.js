'use strict';

// ============================================================
// 潮汐 (Tide) — 记账 + 交易列表
// ============================================================

const Tide = window.Tide || {};
window.Tide = Tide;

Tide.Transactions = {
  // 当前选择
  _type: 'expense',       // 'expense' | 'income'
  _selectedCatId: null,
  _listMonth: null,       // YYYY-MM
  _categories: [],

  // ========== 记账页 (#home) ==========

  renderAdd: function() {
    const main = document.querySelector('#main');
    if (!main) return;
    main.innerHTML = '';
    main.className = 'add-page';

    const self = this;
    // 加载分类
    this._loadCategories().then(function() {
      self._buildAddPage();
    });
  },

  _loadCategories: function() {
    const self = this;
    return Tide.dbGetAll('categories').then(function(cats) {
      self._categories = cats || [];
    });
  },

  _buildAddPage: function() {
    const main = document.querySelector('#main');
    const self = this;

    // --- 金额输入 ---
    const amountDiv = document.createElement('div');
    amountDiv.className = 'amount-input';
    const amountInput = document.createElement('input');
    amountInput.type = 'text';
    amountInput.inputMode = 'decimal';
    amountInput.placeholder = '0.00';
    amountInput.id = 'amount-input';
    amountDiv.appendChild(amountInput);
    main.appendChild(amountDiv);

    // --- 类型切换 ---
    const typeSwitch = document.createElement('div');
    typeSwitch.className = 'type-switch';

    const btnExpense = document.createElement('button');
    btnExpense.id = 'type-expense';
    btnExpense.textContent = '支出';
    btnExpense.className = self._type === 'expense' ? 'active-expense' : '';
    typeSwitch.appendChild(btnExpense);

    const btnIncome = document.createElement('button');
    btnIncome.id = 'type-income';
    btnIncome.textContent = '收入';
    btnIncome.className = self._type === 'income' ? 'active-income' : '';
    typeSwitch.appendChild(btnIncome);

    main.appendChild(typeSwitch);

    // --- 分类滚动 ---
    const catScroll = document.createElement('div');
    catScroll.className = 'cat-scroll';
    catScroll.id = 'cat-scroll';
    main.appendChild(catScroll);

    this._renderCategoryChips(catScroll);

    // --- 附加行 ---
    const extraRow = document.createElement('div');
    extraRow.className = 'extra-row';

    const dateInput = document.createElement('input');
    dateInput.type = 'date';
    dateInput.className = 'date-input';
    dateInput.id = 'date-input';
    const today = new Date();
    dateInput.value = today.getFullYear() + '-' +
      String(today.getMonth() + 1).padStart(2, '0') + '-' +
      String(today.getDate()).padStart(2, '0');
    extraRow.appendChild(dateInput);

    const noteInput = document.createElement('input');
    noteInput.type = 'text';
    noteInput.className = 'note-input';
    noteInput.id = 'note-input';
    noteInput.placeholder = '备注';
    extraRow.appendChild(noteInput);

    main.appendChild(extraRow);

    // --- 记录按钮 ---
    const recordBtn = document.createElement('button');
    recordBtn.className = 'btn btn-primary btn-block';
    recordBtn.textContent = '记录';
    main.appendChild(recordBtn);

    // --- 事件绑定 ---
    btnExpense.addEventListener('click', function() {
      self._type = 'expense';
      self._selectedCatId = null;
      self._buildAddPage();
    });

    btnIncome.addEventListener('click', function() {
      self._type = 'income';
      self._selectedCatId = null;
      self._buildAddPage();
    });

    recordBtn.addEventListener('click', function() {
      self._saveTransaction(amountInput, dateInput, noteInput);
    });
  },

  _renderCategoryChips: function(container) {
    const self = this;
    container.innerHTML = '';

    const filtered = self._categories.filter(function(c) {
      return c.type === self._type;
    });

    if (!filtered.length) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.textContent = '暂无分类';
      container.appendChild(empty);
      return;
    }

    filtered.forEach(function(cat) {
      const chip = document.createElement('div');
      chip.className = 'cat-chip';
      if (cat.id === self._selectedCatId) {
        chip.classList.add('selected');
      }

      const emoji = document.createElement('span');
      emoji.className = 'emoji';
      emoji.textContent = cat.emoji || '💰';
      chip.appendChild(emoji);

      const name = document.createElement('span');
      name.textContent = cat.name;
      chip.appendChild(name);

      chip.addEventListener('click', function() {
        self._selectedCatId = cat.id;
        // 更新所有 chip 的 selected 状态
        const allChips = container.querySelectorAll('.cat-chip');
        allChips.forEach(function(c) { c.classList.remove('selected'); });
        chip.classList.add('selected');
      });

      container.appendChild(chip);
    });
  },

  _saveTransaction: async function(amountInput, dateInput, noteInput) {
    const self = this;
    const amountStr = amountInput.value.trim();
    if (!amountStr || isNaN(parseFloat(amountStr))) {
      Tide.toast('请输入有效金额');
      return;
    }

    if (!self._selectedCatId) {
      Tide.toast('请选择分类');
      return;
    }

    const amount = parseFloat(parseFloat(amountStr).toFixed(2));
    const cat = self._categories.find(function(c) { return c.id === self._selectedCatId; });

    const tx = {
      id: 'local_' + Date.now(),
      amount: amount,
      type: self._type,
      category_id: self._selectedCatId,
      category_name: cat ? cat.name : '',
      category_emoji: cat ? (cat.emoji || '💰') : '💰',
      date: dateInput.value || new Date().toISOString().slice(0, 10),
      note: noteInput.value.trim(),
      tags: [],
      _synced: 0,
      _is_new: true
    };

    try {
      // 先存本地
      await Tide.dbPut('transactions', tx);

      // 尝试同步到服务器
      try {
        await Tide.syncPush();
      } catch (e) {
        // 离线场景，下次自动同步
      }

      Tide.toast('记录成功');

      // 清空表单
      amountInput.value = '';
      noteInput.value = '';
      self._selectedCatId = null;
      self._buildAddPage();

      // 聚焦金额输入
      setTimeout(function() {
        const amt = document.querySelector('#amount-input');
        if (amt) amt.focus();
      }, 100);
    } catch (err) {
      Tide.toast('保存失败: ' + (err.message || '未知错误'));
    }
  },

  // ========== 列表页 (#list) ==========

  renderList: function() {
    const main = document.querySelector('#main');
    if (!main) return;
    main.innerHTML = '';
    main.className = 'list-page';

    const self = this;
    const now = new Date();
    if (!self._listMonth) {
      self._listMonth = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
    }

    // --- 月份选择器 ---
    const monthSelect = document.createElement('div');
    monthSelect.className = 'month-select';

    const btnPrev = document.createElement('button');
    btnPrev.textContent = '←';
    monthSelect.appendChild(btnPrev);

    const monthLabel = document.createElement('span');
    monthLabel.className = 'month-label';
    monthLabel.textContent = self._formatMonthLabel(self._listMonth);
    monthSelect.appendChild(monthLabel);

    const btnNext = document.createElement('button');
    btnNext.textContent = '→';
    monthSelect.appendChild(btnNext);

    main.appendChild(monthSelect);

    // --- 交易列表容器 ---
    const txList = document.createElement('div');
    txList.className = 'tx-list';
    txList.id = 'tx-list';
    main.appendChild(txList);

    // 渲染交易
    this._renderTxList(txList);

    // --- 事件 ---
    btnPrev.addEventListener('click', function() {
      self._changeMonth(-1);
      self.renderList();
    });
    btnNext.addEventListener('click', function() {
      self._changeMonth(1);
      self.renderList();
    });
  },

  _formatMonthLabel: function(ym) {
    const parts = ym.split('-');
    return parts[0] + '年' + parseInt(parts[1], 10) + '月';
  },

  _changeMonth: function(delta) {
    const parts = this._listMonth.split('-');
    const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1 + delta, 1);
    this._listMonth = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  },

  _renderTxList: async function(container) {
    const self = this;
    const ym = self._listMonth;
    const [year, month] = ym.split('-').map(Number);
    const prefix = ym + '-';
    const nextMonth = month === 12 ? (year + 1) + '-01' : year + '-' + String(month + 1).padStart(2, '0');

    const txs = await Tide.dbGetAll('transactions', function(tx) {
      return tx.date >= prefix && tx.date < nextMonth && !tx._deleted;
    });

    // 按日期降序排序
    txs.sort(function(a, b) {
      if (a.date > b.date) return -1;
      if (a.date < b.date) return 1;
      // 同一天按 id 降序（新记录在前）
      return b.id > a.id ? 1 : -1;
    });

    container.innerHTML = '';

    if (!txs.length) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.innerHTML = '<div class="icon">📋</div><p>暂无记录</p>';
      container.appendChild(empty);
      return;
    }

    // 按天分组
    const groups = {};
    txs.forEach(function(tx) {
      if (!groups[tx.date]) groups[tx.date] = [];
      groups[tx.date].push(tx);
    });

    const dates = Object.keys(groups).sort(function(a, b) {
      return b.localeCompare(a);
    });

    const weekDays = ['日', '一', '二', '三', '四', '五', '六'];

    dates.forEach(function(date) {
      // 日期分隔线
      const divider = document.createElement('div');
      divider.className = 'date-divider';

      const d = new Date(date + 'T00:00:00');
      const md = (d.getMonth() + 1) + '月' + d.getDate() + '日';
      const wd = '星期' + weekDays[d.getDay()];

      // 当天合计
      let dayTotal = 0;
      groups[date].forEach(function(tx) {
        if (tx.type === 'expense') {
          dayTotal -= tx.amount;
        } else {
          dayTotal += tx.amount;
        }
      });
      const totalStr = dayTotal >= 0
        ? '收入 ¥' + dayTotal.toFixed(2)
        : '支出 ¥' + Math.abs(dayTotal).toFixed(2);

      divider.textContent = md + ' ' + wd + ' · ' + totalStr;
      container.appendChild(divider);

      // 交易卡片
      groups[date].forEach(function(tx) {
        const card = document.createElement('div');
        card.className = 'tx-card';
        card.setAttribute('data-id', tx.id);

        // 分类 emoji
        const emoji = document.createElement('div');
        emoji.className = 'cat-emoji';
        emoji.textContent = tx.category_emoji || '💰';
        card.appendChild(emoji);

        // 信息区
        const info = document.createElement('div');
        info.className = 'tx-info';

        const catName = document.createElement('div');
        catName.className = 'tx-category';
        catName.textContent = tx.category_name || '未知';
        info.appendChild(catName);

        if (tx.note) {
          const note = document.createElement('div');
          note.className = 'tx-note';
          note.textContent = tx.note;
          info.appendChild(note);
        }

        if (tx.tags && tx.tags.length) {
          const tagsDiv = document.createElement('div');
          tagsDiv.className = 'tx-tags';
          tx.tags.forEach(function(tag) {
            const tagEl = document.createElement('span');
            tagEl.className = 'tag';
            tagEl.textContent = tag;
            tagsDiv.appendChild(tagEl);
          });
          info.appendChild(tagsDiv);
        }

        card.appendChild(info);

        // 金额
        const amount = document.createElement('div');
        amount.className = 'tx-amount';
        amount.classList.add(tx.type === 'expense' ? 'amount-expense' : 'amount-income');
        const sign = tx.type === 'expense' ? '-' : '+';
        amount.textContent = sign + '¥' + tx.amount.toFixed(2);
        card.appendChild(amount);

        // 长按删除
        let pressTimer;
        card.addEventListener('touchstart', function(e) {
          pressTimer = setTimeout(function() {
            self._confirmDeleteTx(tx.id, tx);
          }, 600);
        });
        card.addEventListener('touchend', function() {
          clearTimeout(pressTimer);
        });
        card.addEventListener('touchmove', function() {
          clearTimeout(pressTimer);
        });
        // 桌面端右键
        card.addEventListener('contextmenu', function(e) {
          e.preventDefault();
          self._confirmDeleteTx(tx.id, tx);
        });

        container.appendChild(card);
      });
    });
  },

  _confirmDeleteTx: function(id, tx) {
    const self = this;
    if (!confirm('确定删除这条记录吗？')) return;

    (async function() {
      try {
        // 软删除标记
        tx._deleted = true;
        tx._synced = 0;
        delete tx._is_new;
        await Tide.dbPut('transactions', tx);

        // 尝试同步删除到服务器
        try {
          await Tide.apiDelete('/transactions/' + id);
          await Tide.dbDelete('transactions', id);
        } catch (e) {
          // 离线时保留软删除记录，下次 syncPush 处理
        }

        Tide.toast('已删除');
        self.renderList();
      } catch (err) {
        Tide.toast('删除失败');
      }
    })();
  }
};
