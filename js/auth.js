'use strict';

// ============================================================
// 潮汐 (Tide) — 登录/注册
// ============================================================

const Tide = window.Tide || {};
window.Tide = Tide;

/**
 * 渲染登录/注册页
 */
Tide.Auth = {
  _mode: 'login',

  render: function() {
    const main = document.querySelector('#main');
    if (!main) return;

    // 清空导航栏（登录页不需要）
    const navbar = document.querySelector('#navbar');
    const topbar = document.querySelector('#topbar');
    if (navbar) navbar.innerHTML = '';
    if (topbar) topbar.innerHTML = '';

    main.innerHTML = '';
    main.className = 'auth-page';

    // Logo
    const logo = document.createElement('div');
    logo.className = 'logo';
    logo.textContent = '潮汐';
    main.appendChild(logo);

    // Tab 切换
    const tabRow = document.createElement('div');
    tabRow.className = 'tab-row';

    const btnLogin = document.createElement('button');
    btnLogin.id = 'tab-login';
    btnLogin.textContent = '登录';
    btnLogin.className = this._mode === 'login' ? 'active' : '';
    tabRow.appendChild(btnLogin);

    const btnRegister = document.createElement('button');
    btnRegister.id = 'tab-register';
    btnRegister.textContent = '注册';
    btnRegister.className = this._mode === 'register' ? 'active' : '';
    tabRow.appendChild(btnRegister);

    main.appendChild(tabRow);

    // 表单
    const form = document.createElement('form');
    form.id = 'auth-form';

    const userInput = document.createElement('input');
    userInput.type = 'text';
    userInput.className = 'text';
    userInput.placeholder = '用户名';
    userInput.required = true;
    form.appendChild(userInput);

    const passInput = document.createElement('input');
    passInput.type = 'password';
    passInput.className = 'password';
    passInput.placeholder = '密码';
    passInput.required = true;
    form.appendChild(passInput);

    const inviteInput = document.createElement('input');
    inviteInput.type = 'text';
    inviteInput.className = 'text';
    inviteInput.id = 'invite-field';
    inviteInput.placeholder = '邀请码';
    if (this._mode === 'register') {
      inviteInput.classList.remove('hidden');
      inviteInput.required = true;
    } else {
      inviteInput.classList.add('hidden');
    }
    form.appendChild(inviteInput);

    const submitBtn = document.createElement('button');
    submitBtn.type = 'submit';
    submitBtn.className = 'btn btn-primary btn-block';
    submitBtn.textContent = this._mode === 'login' ? '登录' : '注册';
    form.appendChild(submitBtn);

    main.appendChild(form);

    // --- 事件绑定 ---

    btnLogin.addEventListener('click', (function() {
      this._mode = 'login';
      this.render();
    }).bind(this));

    btnRegister.addEventListener('click', (function() {
      this._mode = 'register';
      this.render();
    }).bind(this));

    form.addEventListener('submit', (function(e) {
      e.preventDefault();
      const username = userInput.value.trim();
      const password = passInput.value;
      const inviteCode = inviteInput.value.trim();

      if (!username || !password) {
        Tide.toast('请填写用户名和密码');
        return;
      }

      if (this._mode === 'register') {
        if (!inviteCode) {
          Tide.toast('请输入邀请码');
          return;
        }
        this._doRegister(username, password, inviteCode);
      } else {
        this._doLogin(username, password);
      }
    }).bind(this));
  },

  _doLogin: async function(username, password) {
    try {
      const result = await Tide.apiPost('/auth/login', { username: username, password: password });
      Tide.setToken(result.token);
      Tide.toast('登录成功');

      // 同步数据
      try { await Tide.syncPull(); } catch (e) { /* 忽略同步失败 */ }

      Router.go('home');
    } catch (err) {
      Tide.toast(err.message || '登录失败');
    }
  },

  _doRegister: async function(username, password, inviteCode) {
    try {
      const result = await Tide.apiPost('/auth/register', {
        username: username,
        password: password,
        invite_code: inviteCode
      });
      Tide.setToken(result.token);
      Tide.toast('注册成功');

      // 同步默认分类和数据
      try { await Tide.syncPull(); } catch (e) { /* 忽略同步失败 */ }

      Router.go('home');
    } catch (err) {
      Tide.toast(err.message || '注册失败');
    }
  }
};
