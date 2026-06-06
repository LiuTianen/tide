'use strict';

// ============================================================
// 潮汐 (Tide) — Hash 路由
// ============================================================

window.Router = {
  // 当前视图
  _current: '',

  // 路由表：view → render 函数
  _routes: {
    'login':     function() { Tide.Auth.render(); },
    'register':  function() { Tide.Auth._mode = 'register'; Tide.Auth.render(); },
    'home':      function() { Tide.Transactions && Tide.Transactions.renderAdd(); },
    'list':      function() { Tide.Transactions && Tide.Transactions.renderList(); },
    'stats':     function() { Tide.Stats && Tide.Stats.render(); },
    'settings':  function() { Tide.Settings && Tide.Settings.render(); }
  },

  /**
   * 跳转到指定视图
   * @param {string} view
   */
  go: function(view) {
    window.location.hash = '#' + view;
  },

  /**
   * 渲染当前 hash 对应的视图
   */
  _render: function() {
    const hash = window.location.hash.replace('#', '') || 'home';
    const view = hash;

    // 检查登录状态
    const token = Tide.getToken && Tide.getToken();
    if (!token && view !== 'login' && view !== 'register') {
      window.location.hash = '#login';
      return;
    }

    // 已登录时访问登录/注册页 → 重定向到首页
    if (token && (view === 'login' || view === 'register')) {
      window.location.hash = '#home';
      return;
    }

    const main = document.querySelector('#main');
    if (!main) return;

    // 清空主页
    main.innerHTML = '';
    main.className = '';

    // 恢复导航栏 / 顶部栏
    this._restoreNavbar(view);

    const renderFn = this._routes[view];
    if (renderFn) {
      this._current = view;
      renderFn();
    } else {
      // 未知路由 → 首页
      this.go('home');
    }
  },

  /**
   * 根据当前视图显示/隐藏导航和顶部栏
   */
  _restoreNavbar: function(view) {
    const navbar = document.querySelector('#navbar');
    const topbar = document.querySelector('#topbar');

    if (view === 'login' || view === 'register') {
      if (navbar) navbar.innerHTML = '';
      if (topbar) topbar.innerHTML = '';
      return;
    }

    // 恢复顶部栏（如果 app.js 还没渲染的话）
    if (topbar && !topbar.querySelector('h1')) {
      topbar.innerHTML = '';
      const h1 = document.createElement('h1');
      h1.textContent = '潮汐';
      topbar.appendChild(h1);
      const span = document.createElement('span');
      span.id = 'topbar-user';
      span.textContent = Tide.currentUser || '';
      topbar.appendChild(span);
    }

    // 更新底部导航 active 状态（如果为空则重建）
    if (navbar) {
      if (!navbar.querySelector('.nav-item')) {
        // 导航栏被清空了，重建
        const navItems = [
          { view: 'home',     emoji: '📝', label: '记账' },
          { view: 'list',     emoji: '📋', label: '流水' },
          { view: 'stats',    emoji: '📊', label: '统计' },
          { view: 'settings', emoji: '⚙️', label: '设置' }
        ];
        navbar.innerHTML = '';
        navItems.forEach(function(ni) {
          const el = document.createElement('div');
          el.className = 'nav-item';
          el.setAttribute('data-view', ni.view);
          el.innerHTML = '<span style="font-size:20px;">' + ni.emoji + '</span><span>' + ni.label + '</span>';
          el.addEventListener('click', function() { Router.go(ni.view); });
          navbar.appendChild(el);
        });
      }
      const items = navbar.querySelectorAll('.nav-item');
      items.forEach(function(item) {
        const href = item.getAttribute('data-view');
        if (href === view) {
          item.classList.add('active');
        } else {
          item.classList.remove('active');
        }
      });
    }
  },

  /**
   * 初始化路由监听
   */
  init: function() {
    window.addEventListener('hashchange', this._render.bind(this));
    // 初始渲染
    this._render();
  }
};
