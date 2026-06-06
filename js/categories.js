'use strict';

// ============================================================
// 潮汐 (Tide) — 分类管理
// ============================================================

const Tide = window.Tide || {};
window.Tide = Tide;

Tide.Categories = {
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
    expenseLabel.style.cssText = 'margin-top: 12px; margin-bottom: 8px; color: #ff6b6b;';
    section.appendChild(expenseLabel);

    const expenseList = document.createElement('div');
    expenseList.id = 'cat-list-expense';
    section.appendChild(expenseList);

    // 收入分类
    const incomeLabel = document.createElement('div');
    incomeLabel.className = 'label';
    incomeLabel.textContent = '收入';
    incomeLabel.style.cssText = 'margin-top: 12px; margin-bottom: 8px; color: #51cf66;';
    section.appendChild(incomeLabel);

    const incomeList = document.createElement('div');
    incomeList.id = 'cat-list-income';
    section.appendChild(incomeList);

    // 添加新分类
    const addSection = document.createElement('div');
    addSection.style.cssText = 'margin-top: 16px;';

    const emojiInput = document.createElement('input');
    emojiInput.type = 'text';
    emojiInput.placeholder = '图标 emoji';
    emojiInput.style.cssText = 'width: 60px; display: inline-block; margin-right: 4px;';
    addSection.appendChild(emojiInput);

    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.placeholder = '分类名称';
    nameInput.style.cssText = 'width: calc(100% - 170px); display: inline-block; margin-right: 4px;';
    addSection.appendChild(nameInput);

    const typeSelect = document.createElement('select');
    typeSelect.style.cssText = 'width: 60px; display: inline-block; margin-right: 4px;';
    const opt1 = document.createElement('option');
    opt1.value = 'expense';
    opt1.textContent = '支出';
    typeSelect.appendChild(opt1);
    const opt2 = document.createElement('option');
    opt2.value = 'income';
    opt2.textContent = '收入';
    typeSelect.appendChild(opt2);
    addSection.appendChild(typeSelect);

    const addBtn = document.createElement('button');
    addBtn.className = 'btn btn-primary';
    addBtn.textContent = '+';
    addBtn.style.cssText = 'width: 36px; padding: 6px;';
    addSection.appendChild(addBtn);

    section.appendChild(addSection);
    container.appendChild(section);

    // 加载并渲染现有分类
    this._renderExistingCategories(expenseList, incomeList);

    // 添加事件
    addBtn.addEventListener('click', function() {
      const emoji = emojiInput.value.trim();
      const name = nameInput.value.trim();
      const type = typeSelect.value;

      if (!name) {
        Tide.toast('请输入分类名称');
        return;
      }
      if (!emoji) {
        Tide.toast('请输入图标 emoji');
        return;
      }

      self._addCategory(emoji, name, type).then(function() {
        emojiInput.value = '';
        nameInput.value = '';
        self._renderExistingCategories(expenseList, incomeList);
      });
    });
  },

  _renderExistingCategories: function(expenseList, incomeList) {
    const self = this;
    Tide.dbGetAll('categories').then(function(cats) {
      expenseList.innerHTML = '';
      incomeList.innerHTML = '';

      cats.forEach(function(cat) {
        const row = document.createElement('div');
        row.className = 'setting-row';
        row.style.cssText = 'display: flex; align-items: center; gap: 8px;';

        const emoji = document.createElement('span');
        emoji.textContent = cat.emoji || '💰';
        emoji.style.cssText = 'font-size: 20px;';
        row.appendChild(emoji);

        const name = document.createElement('span');
        name.textContent = cat.name;
        name.style.cssText = 'flex: 1;';
        row.appendChild(name);

        const delBtn = document.createElement('button');
        delBtn.className = 'btn btn-outline';
        delBtn.textContent = '删除';
        delBtn.style.cssText = 'font-size: 12px; padding: 2px 8px;';
        delBtn.addEventListener('click', function() {
          self._deleteCategory(cat.id).then(function() {
            self._renderExistingCategories(expenseList, incomeList);
          });
        });
        row.appendChild(delBtn);

        if (cat.type === 'expense') {
          expenseList.appendChild(row);
        } else {
          incomeList.appendChild(row);
        }
      });
    });
  },

  _addCategory: async function(emoji, name, type) {
    try {
      const result = await Tide.apiPost('/categories', {
        emoji: emoji,
        name: name,
        type: type
      });

      // 同步到本地
      const cat = result.category || result;
      if (cat && cat.id) {
        await Tide.dbPut('categories', cat);
      }

      Tide.toast('分类已添加');
    } catch (err) {
      Tide.toast('添加失败: ' + (err.message || '未知错误'));
    }
  },

  _deleteCategory: async function(id) {
    if (!confirm('确定删除此分类？')) return;

    try {
      await Tide.apiDelete('/categories/' + id);
      await Tide.dbDelete('categories', id);
      Tide.toast('已删除');
    } catch (err) {
      Tide.toast('删除失败: ' + (err.message || '未知错误'));
    }
  }
};
