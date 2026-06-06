'use strict';

// ============================================================
// 潮汐 (Tide) — 应用入口
// ============================================================

(function() {

  // --- Toast 消息 ---
  let _toastTimer = null;

  Tide.toast = function(msg) {
    // 移除旧 toast
    const old = document.querySelector('.toast');
    if (old) old.remove();
    if (_toastTimer) clearTimeout(_toastTimer);

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = msg;
    document.body.appendChild(toast);

    // 触发动画
    requestAnimationFrame(function() {
      toast.classList.add('show');
    });

    _toastTimer = setTimeout(function() {
      toast.classList.remove('show');
      setTimeout(function() { toast.remove(); }, 300);
    }, 2000);
  };

  // --- 渲染底部导航栏 ---
  function renderNavbar() {
    const navbar = document.querySelector('#navbar');
    if (!navbar) return;
    navbar.innerHTML = '';

    const items = [
      { view: 'home',     emoji: '📝', label: '记账' },
      { view: 'list',     emoji: '📋', label: '流水' },
      { view: 'stats',    emoji: '📊', label: '统计' },
      { view: 'settings', emoji: '⚙️', label: '设置' }
    ];

    items.forEach(function(item) {
      const el = document.createElement('div');
      el.className = 'nav-item';
      el.setAttribute('data-view', item.view);
      el.innerHTML = '<span style="font-size:20px;">' + item.emoji + '</span><span>' + item.label + '</span>';

      el.addEventListener('click', function() {
        Router.go(item.view);
      });

      navbar.appendChild(el);
    });
  }

  // --- 渲染顶部栏 ---
  function renderTopbar() {
    const topbar = document.querySelector('#topbar');
    if (!topbar) return;
    // 登录页不渲染顶栏（由 auth.js 控制）
    const h1 = document.createElement('h1');
    h1.textContent = '潮汐';
    topbar.appendChild(h1);

    const userSpan = document.createElement('span');
    userSpan.id = 'topbar-user';
    userSpan.textContent = Tide.currentUser || '';
    topbar.appendChild(userSpan);
  }

  // --- 从 token 恢复用户名 ---
  function restoreUser() {
    const token = Tide.getToken();
    if (!token) return;
    // 尝试从 token 中解析用户名（简化处理）
    try {
      const payload = token.split('.')[1];
      if (payload) {
        const decoded = JSON.parse(atob(payload));
        Tide.currentUser = decoded.username || decoded.sub || '';
      }
    } catch (e) {
      Tide.currentUser = '';
    }
  }

  // --- iOS 键盘适配 ---
  function setupKeyboardAdaptation() {
    if (!window.visualViewport) return;

    window.visualViewport.addEventListener('resize', function() {
      const currentHeight = window.visualViewport.height;
      const diff = window.innerHeight - currentHeight;

      if (diff > 100) {
        // 键盘弹出
        document.body.classList.add('keyboard-open');
      } else {
        // 键盘收起
        document.body.classList.remove('keyboard-open');
      }
    });
  }

  // --- 注册 Service Worker ---
  function registerSW() {
    if (!('serviceWorker' in navigator)) return;

    navigator.serviceWorker.register('/tide/sw.js').then(function(reg) {
      console.log('SW registered:', reg.scope);
    }).catch(function(err) {
      console.log('SW registration failed:', err);
    });
  }

  // --- 检查 token 有效性 ---
  async function checkToken() {
    const token = Tide.getToken();
    if (!token) return false;

    try {
      await Tide.apiGet('/auth/me');
      return true;
    } catch (e) {
      Tide.clearToken();
      return false;
    }
  }

  // --- 应用启动 ---
  async function init() {
    // 1. 初始化 IndexedDB
    try {
      await Tide.openDB();
    } catch (err) {
      console.error('Failed to open IndexedDB:', err);
    }

    // 2. 注册 Service Worker
    registerSW();

    // 3. 恢复用户信息
    restoreUser();

    // 4. 渲染导航栏
    renderNavbar();
    renderTopbar();

    // 5. 键盘适配
    setupKeyboardAdaptation();

    // 6. 检查登录状态
    const loggedIn = await checkToken();
    if (!loggedIn) {
      Router.init();
      return;
    }

    // 7. 后台同步
    try {
      await Tide.syncPull();
    } catch (e) {
      console.error('Initial sync failed:', e);
    }

    // 8. 初始化路由
    Router.init();
  }

  // --- DOM 加载完成后启动 ---
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
