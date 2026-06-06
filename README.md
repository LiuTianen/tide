# 🌊 潮汐 (Tide)

> 涨潮为入，退潮为出。每日两次，从不失约。

一个极简的多用户记账 PWA。暗黑暖金美学，离线可用，多端同步。

## ✨ 功能

- 🔐 邀请码制注册 / 登录
- 📝 快速记账 — 金额 + 分类 + 图标 + 标签 + 日期 + 备注
- 📋 流水列表 — 按天分组、月份切换、长按删除
- 📊 月度统计 — Canvas 饼图、分类明细、日趋势
- 🔄 多端同步 — IndexedDB ↔ SQLite 增量同步
- 📥 导入导出 — CSV / JSON
- 🎨 48 个预设 emoji 图标选择器
- 📱 PWA — 可安装到桌面、离线可用

## 🏗️ 技术栈

| 层 | 选型 |
|---|---|
| 前端 | Vanilla HTML/CSS/JS（11 JS 模块 / 5 CSS 模块） |
| 后端 | Flask + SQLite + Gunicorn |
| 部署 | Nginx 反向代理 + systemd |
| 存储 | 服务端 SQLite + 客户端 IndexedDB |

## 📁 项目结构

```
tide/
├── index.html              # SPA 入口
├── manifest.json / sw.js   # PWA 配置
├── css/                    # 样式（5 模块）
│   ├── variables.css       # 设计令牌
│   ├── base.css            # 暗黑基础
│   ├── layout.css          # 页面布局
│   ├── components.css      # 组件
│   └── pages.css           # 页面样式
├── js/                     # 逻辑（11 模块）
│   ├── api.js              # 通信层
│   ├── db.js               # IndexedDB 封装
│   ├── sync.js             # 同步引擎
│   ├── auth.js             # 登录/注册
│   ├── router.js           # Hash 路由
│   ├── transactions.js     # 记账 + 列表
│   ├── categories.js       # 分类管理 + 图标选择器
│   ├── stats.js            # 统计（Canvas 饼图）
│   ├── settings.js         # 设置
│   ├── export.js           # 导入导出
│   └── app.js              # 入口
├── server/
│   └── app.py              # Flask 后端（18 端点）
└── assets/icons/           # PWA 图标
```

## 🚀 部署

```bash
# 前端
rsync /root/tide/js/file.js root@host:/var/www/tide/js/file.js

# 后端
scp server/app.py root@host:/var/www/tide/server/app.py
ssh root@host "systemctl restart tide-api"
```

## 📡 API

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/tide/api/auth/register` | 注册（需邀请码） |
| POST | `/tide/api/auth/login` | 登录 |
| POST | `/tide/api/auth/verify` | 验证 Token |
| GET | `/tide/api/transactions` | 交易列表 |
| POST | `/tide/api/transactions` | 创建交易 |
| PUT | `/tide/api/transactions/:id` | 更新交易 |
| DELETE | `/tide/api/transactions/:id` | 删除交易（软删除） |
| GET | `/tide/api/categories` | 分类列表 |
| POST | `/tide/api/categories` | 创建分类 |
| DELETE | `/tide/api/categories/:id` | 删除分类 |
| GET | `/tide/api/sync` | 增量同步 |
| GET | `/tide/api/stats` | 月度统计 |
| GET | `/tide/api/export` | 导出 CSV |
| POST | `/tide/api/import` | 导入 CSV |
| GET | `/tide/api/admin/invites` | 邀请码列表 |
| POST | `/tide/api/admin/invites` | 生成邀请码 |
| DELETE | `/tide/api/admin/invites/:id` | 删除邀请码 |

## 📄 License

MIT
