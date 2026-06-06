'use strict';

// ============================================================
// 潮汐 (Tide) — 分类管理（含图标选择器）
// ============================================================

var Tide = window.Tide || {};
window.Tide = Tide;

// 预设图标库
Tide.CategoryIcons = [
  '🍜','🍕','🍔','☕','🍺','🥗','🍰','🍱',
  '🚗','🚌','🚇','⛽','🚲','✈️','🚕','🛵',
  '🛒','👗','👟','💄','📱','💻','🎧','📦',
  '🎮','🎬','🎵','🏀','⚽','🎨','📚','🎓',
  '🏠','💡','🔧','🧹','🛏️','🏥','💊','🏦',
  '💰','📈','🧧','🎁','💳','💼','🐱','📝'
];

Tide.Categories = {
  _pickerVisible: false,

  /** 在容器中渲染分类管理 UI（由 settings.js 调用） */
  renderManager: function(container) {
    const self = this;
    container.innerHTML = '';

    const section = document.createElement('div');
    section.className = 'section';

    const title = document.createElement('div');
    title.className = 'section-title';
    title.textContent = '分类管理';
    section.appendChild(title);

    // 支出分类
    const expenseLabel = document.createElement('div');
    expenseLabel.className = 'label';
    expenseLabel.textContent = '支出';
    expenseLabel.style.cssText = 'margin-top:12px;margin-bottom:8px;color:#c94e4e;';
    section.appendChild(expenseLabel);

    const expenseList = document.createElement('div');
    expenseList.id = 'cat-list-expense';
    section.appendChild(expenseList);

    // 收入分类
    const incomeLabel = document.createElement('div');
    incomeLabel.className = 'label';
    incomeLabel.textContent = '收入';
    incomeLabel.style.cssText = 'margin-top:12px;margin-bottom:8px;color:#6ebf8b;';
    section.appendChild(incomeLabel);

    const incomeList = document.createElement('div');
    incomeList.id = 'cat-list-income';
    section.appendChild(incomeList);

    // 添加新分类
    const addSection = document.createElement('div');
    addSection.style.cssText = 'margin-top:16px;';

    // 图标按钮（点击弹出选择器）
    const iconBtn = document.createElement('button');
    iconBtn.id = 'icon-picker-btn';
    iconBtn.textContent = '💰';
    iconBtn.style.cssText = 'width:44px;height:44px;font-size:22px;border-radius:8px;background:var(--bg-card);border:1px solid var(--border);cursor:pointer;margin-right:4px;vertical-align:middle;';
    iconBtn.addEventListener('click', function(e) {
      e.preventDefault();
      self._toggleIconPicker(iconBtn);
    });
    addSection.appendChild(iconBtn);

    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.placeholder = '分类名称';
    nameInput.style.cssText = 'width:calc(100% - 160px);display:inline-block;margin-right:4px;vertical-align:middle;';
    addSection.appendChild(nameInput);

    const typeSelect = document.createElement('select');
    typeSelect.style.cssText = 'width:60px;display:inline-block;margin-right:4px;vertical-align:middle;';
    typeSelect.innerHTML = '<option value="expense">支出</option><option value="income">收入</option>';
    addSection.appendChild(typeSelect);

    const addBtn = document.createElement('button');
    addBtn.className = 'btn btn-primary';
    addBtn.textContent = '+';
    addBtn.style.cssText = 'width:36px;padding:6px;vertical-align:middle;';
    addSection.appendChild(addBtn);

    // 图标选择面板（默认隐藏）
    const picker = document.createElement('div');
    picker.id = 'icon-picker-panel';
    picker.style.cssText = 'display:none;margin-top:8px;padding:8px;background:var(--bg-card);border-radius:var(--radius);max-height:200px;overflow-y:auto;';
    Tide.CategoryIcons.forEach(function(ic) {
      const item = document.createElement('button');
      item.textContent = ic;
      item.style.cssText = 'font-size:20px;padding:6px;background:transparent;border:none;border-radius:6px;cursor:pointer;transition:background .15s;';
      item.addEventListener('click', function(e) {
        e.preventDefault();
        iconBtn.textContent = ic;
        picker.style.display = 'none';
        self._pickerVisible = false;
      });
      picker.appendChild(item);
    });
    addSection.appendChild(picker);

    section.appendChild(addSection);
    container.appendChild(section);

    // 加载并渲染现有分类
    this._renderExistingCategories(expenseList, incomeList);

    // 添加事件
    addBtn.addEventListener('click', function() {
      const icon = iconBtn.textContent;
      const name = nameInput.value.trim();
      const type = typeSelect.value;
      if (!name) { Tide.toast('请输入分类名称'); return; }
      self._addCategory(icon, name, type).then(function() {
        nameInput.value = '';
        iconBtn.textContent = '💰';
        self._renderExistingCategories(expenseList, incomeList);
      });
    });
  },

  _toggleIconPicker: function(btn) {
    const picker = document.getElementById('icon-picker-panel');
    if (!picker) return;
    this._pickerVisible = !this._pickerVisible;
    picker.style.display = this._pickerVisible ? 'grid' : 'none';
    if (this._pickerVisible) {
      picker.style.gridTemplateColumns = 'repeat(8,1fr)';
      picker.style.gap = '4px';
    }

    // 点击其他地方关闭
    if (this._pickerVisible) {
      const self = this;
      setTimeout(function() {
        document.addEventListener('click', function closePicker(e) {
          if (!picker.contains(e.target) && e.target !== btn) {
            picker.style.display = 'none';
            self._pickerVisible = false;
            document.removeEventListener('click', closePicker);
          }
        });
      }, 50);
    }
  },

  _renderExistingCategories: function(expenseList, incomeList) {
    const self = this;
    Tide.dbGetAll('categories').then(function(cats) {
      expenseList.innerHTML = '';
      incomeList.innerHTML = '';

      cats.forEach(function(cat) {
        const row = document.createElement('div');
        row.className = 'setting-row';
        row.style.cssText = 'display:flex;align-items:center;gap:8px;';

        const iconSpan = document.createElement('span');
        iconSpan.textContent = cat.icon || '💰';
        iconSpan.style.cssText = 'font-size:20px;';
        row.appendChild(iconSpan);

        const name = document.createElement('span');
        name.textContent = cat.name;
        name.style.cssText = 'flex:1;';
        row.appendChild(name);

        const delBtn = document.createElement('button');
        delBtn.className = 'btn btn-outline';
        delBtn.textContent = '删除';
        delBtn.style.cssText = 'font-size:12px;padding:2px 8px;';
        delBtn.addEventListener('click', function() {
          if (!confirm('确定删除「' + cat.name + '」？')) return;
          self._deleteCategory(cat.id).then(function() {
            self._renderExistingCategories(expenseList, incomeList);
          });
        });
        row.appendChild(delBtn);

        if (cat.type === 'expense') expenseList.appendChild(row);
        else incomeList.appendChild(row);
      });
    }).catch(function(err) {
      console.error('Failed to load categories from IndexedDB:', err);
    });
  },

  _addCategory: async function(icon, name, type) {
    try {
      const result = await Tide.apiPost('/categories', {
        icon: icon,
        name: name,
        type: type
      });
      const cat = result.category || result;
      if (cat && cat.id) {
        await Tide.dbPut('categories', cat);
        await Tide.syncPush();
      }
      Tide.toast('分类已添加');
    } catch (err) {
      Tide.toast('添加失败: ' + (err.message || '未知错误'));
    }
  },

  _deleteCategory: async function(id) {
    try {
      await Tide.apiDelete('/categories/' + id);
      await Tide.dbDelete('categories', id);
      await Tide.syncPush();
      Tide.toast('已删除');
    } catch (err) {
      Tide.toast('删除失败: ' + (err.message || '未知错误'));
    }
  }
};
