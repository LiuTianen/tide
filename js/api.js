'use strict';

// ============================================================
// 潮汐 (Tide) — API 通信层
// ============================================================

const Tide = window.Tide || {};
window.Tide = Tide;

const API_BASE = '/tide/api';

// --- Token 管理 ---

Tide.getToken = function() {
  return localStorage.getItem('tide_token');
};

Tide.setToken = function(token) {
  localStorage.setItem('tide_token', token);
};

Tide.clearToken = function() {
  localStorage.removeItem('tide_token');
};

// --- 核心请求函数 ---

/**
 * 带身份认证的 fetch 包装
 * @param {string} path - API 路径（不含 /tide/api 前缀）
 * @param {object} opts - fetch 选项
 * @returns {Promise<object>} 解析后的 JSON 数据
 */
Tide.apiFetch = async function(path, opts) {
  if (!opts) opts = {};

  const headers = opts.headers || {};
  headers['Authorization'] = 'Bearer ' + (Tide.getToken() || '');
  // 如果 body 不是 FormData，默认设置 Content-Type
  if (opts.body && !(opts.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const url = API_BASE + path;

  let res;
  try {
    res = await fetch(url, { ...opts, headers });
  } catch (err) {
    Tide.toast && Tide.toast('网络连接失败');
    throw err;
  }

  // 401 → 清除 token 并跳转登录
  if (res.status === 401) {
    Tide.clearToken();
    if (window.Router && Router.go) {
      Router.go('login');
    } else {
      window.location.hash = '#login';
    }
    throw new Error('Unauthorized');
  }

  // 尝试解析 JSON
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const json = await res.json();
    if (!res.ok) {
      throw new Error(json.error || json.message || '请求失败');
    }
    return json;
  }

  if (!res.ok) {
    throw new Error('请求失败 (' + res.status + ')');
  }

  return res;
};

// --- 便捷方法 ---

Tide.apiGet = function(path) {
  return Tide.apiFetch(path, { method: 'GET' });
};

Tide.apiPost = function(path, body) {
  return Tide.apiFetch(path, {
    method: 'POST',
    body: typeof body === 'object' && !(body instanceof FormData)
      ? JSON.stringify(body) : body
  });
};

Tide.apiPut = function(path, body) {
  return Tide.apiFetch(path, {
    method: 'PUT',
    body: typeof body === 'object' && !(body instanceof FormData)
      ? JSON.stringify(body) : body
  });
};

Tide.apiDelete = function(path) {
  return Tide.apiFetch(path, { method: 'DELETE' });
};
