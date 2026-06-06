"""
潮汐 (Tide) — 多用户记账 PWA 后端
Flask + SQLite + bcrypt
部署路径: /tide/api/
"""

import csv
import hashlib
import io
import json
import os
import secrets
from datetime import datetime
from functools import wraps
from pathlib import Path

from flask import Flask, g, jsonify, request, send_file
from werkzeug.security import check_password_hash, generate_password_hash

# ──────────────────────────────────────────────
# 配置
# ──────────────────────────────────────────────

DB_PATH = "/var/lib/tide/tide.db"
INVITE_CODES_PATH = "/var/lib/tide/.invite_codes"
MASTERKEY_PATH = "/var/lib/tide/.masterkey"

app = Flask(__name__)

# ──────────────────────────────────────────────
# 数据库初始化 & 工具
# ──────────────────────────────────────────────

import sqlite3


def get_db():
    """获取当前请求的数据库连接（每个请求独立连接）"""
    if "db" not in g:
        db = sqlite3.connect(DB_PATH)
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA journal_mode=WAL")
        db.execute("PRAGMA foreign_keys=ON")
        g.db = db
    return g.db


@app.teardown_appcontext
def close_db(exception):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db():
    """创建表结构和索引（幂等）"""
    Path(DB_PATH).parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(DB_PATH)
    db.execute("PRAGMA journal_mode=WAL")
    db.execute("PRAGMA foreign_keys=ON")

    db.executescript("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            invite_code TEXT NOT NULL,
            created_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS invite_codes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            code TEXT UNIQUE NOT NULL,
            created_by TEXT NOT NULL,
            created_at TEXT DEFAULT (datetime('now')),
            used_by INTEGER,
            used_at TEXT,
            max_uses INTEGER DEFAULT 1,
            use_count INTEGER DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS transactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL REFERENCES users(id),
            type TEXT NOT NULL CHECK(type IN ('expense','income')),
            amount REAL NOT NULL,
            category TEXT NOT NULL,
            tags TEXT DEFAULT '[]',
            note TEXT DEFAULT '',
            date TEXT NOT NULL,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now')),
            deleted INTEGER DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS categories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL REFERENCES users(id),
            type TEXT NOT NULL CHECK(type IN ('expense','income')),
            name TEXT NOT NULL,
            icon TEXT DEFAULT '',
            sort_order INTEGER DEFAULT 0,
            is_default INTEGER DEFAULT 0,
            UNIQUE(user_id, type, name)
        );

        CREATE TABLE IF NOT EXISTS sync_state (
            user_id INTEGER PRIMARY KEY REFERENCES users(id),
            version INTEGER DEFAULT 0
        );

        CREATE INDEX IF NOT EXISTS idx_tx_user_date ON transactions(user_id, date);
        CREATE INDEX IF NOT EXISTS idx_tx_user_updated ON transactions(user_id, updated_at);
        CREATE INDEX IF NOT EXISTS idx_cat_user ON categories(user_id);
    """)
    db.commit()
    db.close()


# ──────────────────────────────────────────────
# 辅助函数
# ──────────────────────────────────────────────

DEFAULT_EXPENSE_CATEGORIES = [
    ("🍜餐饮", "🍜"), ("🚗交通", "🚗"), ("🛒购物", "🛒"),
    ("🎮娱乐", "🎮"), ("🏠住房", "🏠"), ("💊医疗", "💊"),
    ("📦日用", "📦"), ("📝其他", "📝"),
]
DEFAULT_INCOME_CATEGORIES = [
    ("💼工资", "💼"), ("💰兼职", "💰"), ("📈理财", "📈"),
    ("🧧红包", "🧧"), ("📝其他", "📝"),
]


def init_default_categories(user_id):
    """为新用户创建默认分类"""
    db = get_db()
    sort = 0
    for name, icon in DEFAULT_EXPENSE_CATEGORIES:
        db.execute(
            "INSERT OR IGNORE INTO categories (user_id, type, name, icon, sort_order, is_default) "
            "VALUES (?, 'expense', ?, ?, ?, 1)",
            (user_id, name, icon, sort),
        )
        sort += 1
    sort = 0
    for name, icon in DEFAULT_INCOME_CATEGORIES:
        db.execute(
            "INSERT OR IGNORE INTO categories (user_id, type, name, icon, sort_order, is_default) "
            "VALUES (?, 'income', ?, ?, ?, 1)",
            (user_id, name, icon, sort),
        )
        sort += 1
    db.commit()


def make_token(username, password_hash):
    """生成认证 token"""
    raw = f"{username}:{password_hash}"
    return hashlib.sha256(raw.encode()).hexdigest()


def bump_version(user_id):
    """递增 sync_state.version"""
    db = get_db()
    db.execute("UPDATE sync_state SET version = version + 1 WHERE user_id = ?", (user_id,))
    db.commit()


def row_to_dict(row):
    """将 sqlite3.Row 转换为普通 dict"""
    if row is None:
        return None
    return dict(row)


def load_masterkey():
    """读取 master key"""
    try:
        return Path(MASTERKEY_PATH).read_text().strip()
    except FileNotFoundError:
        return None


# ──────────────────────────────────────────────
# 认证装饰器
# ──────────────────────────────────────────────

def require_auth(f):
    """用户 Bearer token 鉴权"""
    @wraps(f)
    def decorated(*args, **kwargs):
        auth = request.headers.get("Authorization", "")
        if not auth.startswith("Bearer "):
            return jsonify({"error": "Missing or invalid Authorization header"}), 401
        token = auth[7:]
        db = get_db()
        # token = sha256(username:password_hash)
        users = db.execute("SELECT id, username, password_hash FROM users").fetchall()
        matched = None
        for u in users:
            if make_token(u["username"], u["password_hash"]) == token:
                matched = u
                break
        if matched is None:
            return jsonify({"error": "Invalid token"}), 401
        g.user_id = matched["id"]
        g.username = matched["username"]
        return f(*args, **kwargs)
    return decorated


def require_admin(f):
    """管理员 master key 鉴权"""
    @wraps(f)
    def decorated(*args, **kwargs):
        auth = request.headers.get("Authorization", "")
        if not auth.startswith("Bearer "):
            return jsonify({"error": "Missing or invalid Authorization header"}), 401
        token = auth[7:]
        masterkey = load_masterkey()
        if masterkey is None or token != masterkey:
            return jsonify({"error": "Admin access required"}), 403
        return f(*args, **kwargs)
    return decorated


# ──────────────────────────────────────────────
# 公开端点：认证
# ──────────────────────────────────────────────

@app.route("/tide/api/auth/register", methods=["POST"])
def auth_register():
    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "Invalid JSON"}), 400

    username = (data.get("username") or "").strip()
    password = (data.get("password") or "")
    invite_code_input = (data.get("invite_code") or "").strip()

    if not username or not password:
        return jsonify({"error": "Username and password are required"}), 400
    if not invite_code_input:
        return jsonify({"error": "Invite code is required"}), 400

    db = get_db()

    # 检查用户名是否已存在
    existing = db.execute("SELECT id FROM users WHERE username = ?", (username,)).fetchone()
    if existing:
        return jsonify({"error": "Username taken"}), 400

    # 验证邀请码
    invite = db.execute(
        "SELECT id, max_uses, use_count FROM invite_codes WHERE code = ?",
        (invite_code_input,),
    ).fetchone()
    if invite is None:
        return jsonify({"error": "Invalid invite code"}), 400
    if invite["use_count"] >= invite["max_uses"]:
        return jsonify({"error": "Invite code has been used up"}), 400

    # 创建用户
    password_hash = generate_password_hash(password)
    db.execute(
        "INSERT INTO users (username, password_hash, invite_code) VALUES (?, ?, ?)",
        (username, password_hash, invite_code_input),
    )
    user_id = db.execute("SELECT last_insert_rowid()").fetchone()[0]

    # 更新邀请码使用记录
    db.execute(
        "UPDATE invite_codes SET used_by = ?, used_at = datetime('now'), use_count = use_count + 1 WHERE id = ?",
        (user_id, invite["id"]),
    )

    # 创建 sync_state 记录
    db.execute("INSERT INTO sync_state (user_id, version) VALUES (?, 0)", (user_id,))
    db.commit()

    # 初始化默认分类
    init_default_categories(user_id)

    token = make_token(username, password_hash)
    return jsonify({"token": token}), 201


@app.route("/tide/api/auth/login", methods=["POST"])
def auth_login():
    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "Invalid JSON"}), 400

    username = (data.get("username") or "").strip()
    password = data.get("password") or ""

    db = get_db()
    user = db.execute(
        "SELECT id, username, password_hash FROM users WHERE username = ?",
        (username,),
    ).fetchone()

    if user is None or not check_password_hash(user["password_hash"], password):
        return jsonify({"error": "Invalid credentials"}), 401

    token = make_token(user["username"], user["password_hash"])
    return jsonify({"token": token}), 200


@app.route("/tide/api/auth/verify", methods=["POST"])
def auth_verify():
    data = request.get_json(silent=True)
    if not data:
        return jsonify({"valid": False}), 200

    token = (data.get("token") or "").strip()
    if not token:
        return jsonify({"valid": False}), 200

    db = get_db()
    users = db.execute("SELECT id, username, password_hash FROM users").fetchall()
    for u in users:
        if make_token(u["username"], u["password_hash"]) == token:
            return jsonify({"valid": True, "username": u["username"]}), 200

    return jsonify({"valid": False}), 200


# ──────────────────────────────────────────────
# 用户端点：交易
# ──────────────────────────────────────────────

@app.route("/tide/api/transactions", methods=["GET"])
@require_auth
def list_transactions():
    month = request.args.get("month", "")
    page = int(request.args.get("page", 1))
    limit = int(request.args.get("limit", 50))
    if limit > 200:
        limit = 200
    offset = (page - 1) * limit

    db = get_db()

    params = [g.user_id]
    where = "WHERE user_id = ? AND deleted = 0"

    if month and len(month) == 7:  # YYYY-MM
        where += " AND date LIKE ?"
        params.append(f"{month}%")

    # 总数
    total_row = db.execute(
        f"SELECT COUNT(*) FROM transactions {where}", params
    ).fetchone()
    total = total_row[0] if total_row else 0

    # 分页数据
    rows = db.execute(
        f"SELECT * FROM transactions {where} ORDER BY date DESC, id DESC LIMIT ? OFFSET ?",
        params + [limit, offset],
    ).fetchall()

    items = []
    for r in rows:
        d = row_to_dict(r)
        d["tags"] = json.loads(d.get("tags", "[]"))
        items.append(d)

    return jsonify({"items": items, "total": total, "page": page}), 200


@app.route("/tide/api/transactions", methods=["POST"])
@require_auth
def create_transaction():
    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "Invalid JSON"}), 400

    tx_type = data.get("type", "expense")
    if tx_type not in ("expense", "income"):
        return jsonify({"error": "Type must be 'expense' or 'income'"}), 400

    amount = data.get("amount")
    if amount is None or not isinstance(amount, (int, float)) or amount <= 0:
        return jsonify({"error": "Amount must be a positive number"}), 400

    category = (data.get("category") or "").strip()
    if not category:
        return jsonify({"error": "Category is required"}), 400

    tags = data.get("tags", [])
    if not isinstance(tags, list):
        tags = []
    note = data.get("note", "") or ""
    date = data.get("date", "") or datetime.now().strftime("%Y-%m-%d")

    db = get_db()
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    db.execute(
        """INSERT INTO transactions (user_id, type, amount, category, tags, note, date, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (g.user_id, tx_type, amount, category, json.dumps(tags, ensure_ascii=False), note, date, now, now),
    )
    tx_id = db.execute("SELECT last_insert_rowid()").fetchone()[0]
    db.commit()

    bump_version(g.user_id)

    row = db.execute("SELECT * FROM transactions WHERE id = ?", (tx_id,)).fetchone()
    result = row_to_dict(row)
    result["tags"] = json.loads(result.get("tags", "[]"))
    return jsonify(result), 201


@app.route("/tide/api/transactions/<int:tx_id>", methods=["PUT"])
@require_auth
def update_transaction(tx_id):
    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "Invalid JSON"}), 400

    db = get_db()
    row = db.execute(
        "SELECT * FROM transactions WHERE id = ? AND user_id = ? AND deleted = 0",
        (tx_id, g.user_id),
    ).fetchone()
    if row is None:
        return jsonify({"error": "Transaction not found"}), 404

    # 允许部分更新
    tx_type = data.get("type", row["type"])
    if tx_type not in ("expense", "income"):
        tx_type = row["type"]

    amount = data.get("amount", row["amount"])
    category = data.get("category", row["category"])
    tags = data.get("tags", json.loads(row["tags"]))
    if not isinstance(tags, list):
        tags = json.loads(row["tags"])
    note = data.get("note", row["note"])
    date = data.get("date", row["date"])

    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    db.execute(
        """UPDATE transactions SET type=?, amount=?, category=?, tags=?, note=?, date=?, updated_at=?
           WHERE id=? AND user_id=?""",
        (tx_type, amount, category, json.dumps(tags, ensure_ascii=False), note, date, now, tx_id, g.user_id),
    )
    db.commit()
    bump_version(g.user_id)

    updated = db.execute("SELECT * FROM transactions WHERE id = ?", (tx_id,)).fetchone()
    result = row_to_dict(updated)
    result["tags"] = json.loads(result.get("tags", "[]"))
    return jsonify(result), 200


@app.route("/tide/api/transactions/<int:tx_id>", methods=["DELETE"])
@require_auth
def delete_transaction(tx_id):
    db = get_db()
    row = db.execute(
        "SELECT id FROM transactions WHERE id = ? AND user_id = ? AND deleted = 0",
        (tx_id, g.user_id),
    ).fetchone()
    if row is None:
        return jsonify({"error": "Transaction not found"}), 404

    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    db.execute(
        "UPDATE transactions SET deleted = 1, updated_at = ? WHERE id = ?",
        (now, tx_id),
    )
    db.commit()
    bump_version(g.user_id)

    return jsonify({"deleted": True}), 200


# ──────────────────────────────────────────────
# 用户端点：分类
# ──────────────────────────────────────────────

@app.route("/tide/api/categories", methods=["GET"])
@require_auth
def list_categories():
    db = get_db()
    rows = db.execute(
        "SELECT * FROM categories WHERE user_id = ? ORDER BY sort_order",
        (g.user_id,),
    ).fetchall()

    expense_cats = []
    income_cats = []
    for r in rows:
        d = row_to_dict(r)
        if d["type"] == "expense":
            expense_cats.append(d)
        else:
            income_cats.append(d)

    return jsonify({"expense": expense_cats, "income": income_cats}), 200


@app.route("/tide/api/categories", methods=["POST"])
@require_auth
def create_category():
    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "Invalid JSON"}), 400

    cat_type = data.get("type", "expense")
    if cat_type not in ("expense", "income"):
        return jsonify({"error": "Type must be 'expense' or 'income'"}), 400

    name = (data.get("name") or "").strip()
    if not name:
        return jsonify({"error": "Category name is required"}), 400

    icon = data.get("icon", "") or ""

    db = get_db()
    # 获取当前最大 sort_order
    max_sort = db.execute(
        "SELECT COALESCE(MAX(sort_order), -1) FROM categories WHERE user_id = ? AND type = ?",
        (g.user_id, cat_type),
    ).fetchone()[0]

    try:
        db.execute(
            "INSERT INTO categories (user_id, type, name, icon, sort_order) VALUES (?, ?, ?, ?, ?)",
            (g.user_id, cat_type, name, icon, max_sort + 1),
        )
        db.commit()
        bump_version(g.user_id)
        cat_id = db.execute("SELECT last_insert_rowid()").fetchone()[0]
    except sqlite3.IntegrityError:
        return jsonify({"error": "Category already exists"}), 400

    row = db.execute("SELECT * FROM categories WHERE id = ?", (cat_id,)).fetchone()
    return jsonify(row_to_dict(row)), 201


@app.route("/tide/api/categories/<int:cat_id>", methods=["PUT"])
@require_auth
def update_category(cat_id):
    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "Invalid JSON"}), 400

    db = get_db()
    row = db.execute(
        "SELECT * FROM categories WHERE id = ? AND user_id = ?",
        (cat_id, g.user_id),
    ).fetchone()
    if row is None:
        return jsonify({"error": "Category not found"}), 404

    name = data.get("name", row["name"])
    icon = data.get("icon", row["icon"])
    sort_order = data.get("sort_order", row["sort_order"])

    db.execute(
        "UPDATE categories SET name=?, icon=?, sort_order=? WHERE id=? AND user_id=?",
        (name, icon, sort_order, cat_id, g.user_id),
    )
    db.commit()
    bump_version(g.user_id)

    updated = db.execute("SELECT * FROM categories WHERE id = ?", (cat_id,)).fetchone()
    return jsonify(row_to_dict(updated)), 200


@app.route("/tide/api/categories/<int:cat_id>", methods=["DELETE"])
@require_auth
def delete_category(cat_id):
    db = get_db()
    row = db.execute(
        "SELECT id FROM categories WHERE id = ? AND user_id = ?",
        (cat_id, g.user_id),
    ).fetchone()
    if row is None:
        return jsonify({"error": "Category not found"}), 404

    db.execute("DELETE FROM categories WHERE id = ? AND user_id = ?", (cat_id, g.user_id))
    db.commit()
    bump_version(g.user_id)

    return jsonify({"deleted": True}), 200


# ──────────────────────────────────────────────
# 用户端点：同步
# ──────────────────────────────────────────────

@app.route("/tide/api/sync", methods=["GET"])
@require_auth
def sync_changes():
    since_version = int(request.args.get("since_version", 0))

    db = get_db()
    state = db.execute(
        "SELECT version FROM sync_state WHERE user_id = ?", (g.user_id,)
    ).fetchone()
    current_version = state["version"] if state else 0

    # 无变更时快速返回
    if since_version >= current_version:
        return jsonify({"version": current_version, "changes": []}), 200

    changes = []

    # 返回所有分类（数量少，全量同步即可）
    all_cats = db.execute(
        "SELECT * FROM categories WHERE user_id = ? ORDER BY sort_order", (g.user_id,)
    ).fetchall()
    for cat in all_cats:
        changes.append({"table": "categories", "action": "upsert", "data": row_to_dict(cat)})

    # 返回所有交易（含软删除），客户端根据 deleted 字段判断
    # 个人记账场景交易量有限（通常每月 < 1000 条），全量同步可行
    all_tx = db.execute(
        "SELECT * FROM transactions WHERE user_id = ? ORDER BY updated_at DESC",
        (g.user_id,),
    ).fetchall()
    for tx in all_tx:
        d = row_to_dict(tx)
        d["tags"] = json.loads(d.get("tags", "[]"))
        if d["deleted"]:
            changes.append({"table": "transactions", "action": "delete", "data": {"id": d["id"]}})
        else:
            changes.append({"table": "transactions", "action": "upsert", "data": d})

    return jsonify({"version": current_version, "changes": changes}), 200


# ──────────────────────────────────────────────
# 用户端点：统计
# ──────────────────────────────────────────────

@app.route("/tide/api/stats", methods=["GET"])
@require_auth
def get_stats():
    month = request.args.get("month", "")
    db = get_db()

    params = [g.user_id]
    where = "WHERE user_id = ? AND deleted = 0"
    if month and len(month) == 7:
        where += " AND date LIKE ?"
        params.append(f"{month}%")

    # 按类型汇总
    summary = db.execute(
        f"SELECT type, SUM(amount) as total FROM transactions {where} GROUP BY type",
        params,
    ).fetchall()

    total_expense = 0.0
    total_income = 0.0
    for s in summary:
        if s["type"] == "expense":
            total_expense = round(s["total"] or 0, 2)
        else:
            total_income = round(s["total"] or 0, 2)

    # 按分类汇总
    cat_rows = db.execute(
        f"SELECT category, SUM(amount) as total FROM transactions {where} AND type='expense' GROUP BY category ORDER BY total DESC",
        params,
    ).fetchall()
    by_category = [{"category": r["category"], "amount": round(r["total"], 2)} for r in cat_rows]

    # 按天汇总
    daily_rows = db.execute(
        f"SELECT date, type, SUM(amount) as total FROM transactions {where} GROUP BY date, type ORDER BY date",
        params,
    ).fetchall()
    daily_map = {}
    for r in daily_rows:
        d = r["date"]
        if d not in daily_map:
            daily_map[d] = {"date": d, "expense": 0.0, "income": 0.0}
        daily_map[d][r["type"]] = round(r["total"], 2)
    daily = sorted(daily_map.values(), key=lambda x: x["date"])

    return jsonify({
        "total_expense": total_expense,
        "total_income": total_income,
        "by_category": by_category,
        "daily": daily,
    }), 200


# ──────────────────────────────────────────────
# 用户端点：导出 CSV
# ──────────────────────────────────────────────

@app.route("/tide/api/export", methods=["GET"])
@require_auth
def export_csv():
    month = request.args.get("month", "")
    db = get_db()

    params = [g.user_id]
    where = "WHERE user_id = ? AND deleted = 0"
    if month and len(month) == 7:
        where += " AND date LIKE ?"
        params.append(f"{month}%")

    rows = db.execute(
        f"SELECT date, type, amount, category, tags, note FROM transactions {where} ORDER BY date DESC",
        params,
    ).fetchall()

    output = io.StringIO()
    output.write("\ufeff")  # BOM for Excel UTF-8 compatibility
    writer = csv.writer(output)
    writer.writerow(["日期", "类型", "金额", "分类", "标签", "备注"])

    type_map = {"expense": "支出", "income": "收入"}
    for r in rows:
        tags = json.loads(r["tags"] or "[]")
        writer.writerow([
            r["date"],
            type_map.get(r["type"], r["type"]),
            r["amount"],
            r["category"],
            "、".join(tags) if tags else "",
            r["note"] or "",
        ])

    output.seek(0)
    mem = io.BytesIO(output.getvalue().encode("utf-8"))
    mem.seek(0)

    filename = f"tide_export_{month or 'all'}.csv"
    return send_file(
        mem,
        mimetype="text/csv",
        as_attachment=True,
        download_name=filename,
    )


# ──────────────────────────────────────────────
# 用户端点：导入 CSV
# ──────────────────────────────────────────────

@app.route("/tide/api/import", methods=["POST"])
@require_auth
def import_csv():
    if "file" not in request.files:
        return jsonify({"error": "No file uploaded"}), 400

    file = request.files["file"]
    if not file.filename or not file.filename.endswith(".csv"):
        return jsonify({"error": "Please upload a CSV file"}), 400

    # 读取并解码
    raw = file.read()
    # BOM 自适应
    if raw.startswith(b"\xef\xbb\xbf"):
        content = raw.decode("utf-8-sig")
    else:
        try:
            content = raw.decode("utf-8")
        except UnicodeDecodeError:
            content = raw.decode("gbk", errors="replace")

    reader = csv.DictReader(io.StringIO(content))
    db = get_db()
    type_map_reverse = {"支出": "expense", "收入": "income", "expense": "expense", "income": "income"}
    imported = 0
    skipped = 0

    for row in reader:
        date = (row.get("日期") or row.get("date") or "").strip()
        if not date:
            continue

        tx_type_raw = (row.get("类型") or row.get("type") or "支出").strip()
        tx_type = type_map_reverse.get(tx_type_raw, "expense")

        try:
            amount = float(row.get("金额") or row.get("amount") or 0)
        except ValueError:
            continue
        if amount <= 0:
            continue

        category = (row.get("分类") or row.get("category") or "其他").strip()

        tags_raw = (row.get("标签") or row.get("tags") or "").strip()
        if tags_raw:
            tags = [t.strip() for t in tags_raw.replace("，", ",").replace("、", ",").split(",") if t.strip()]
        else:
            tags = []

        note = (row.get("备注") or row.get("note") or "").strip()

        # 去重检查
        existing = db.execute(
            """SELECT id FROM transactions
               WHERE user_id=? AND date=? AND type=? AND amount=? AND category=? AND note=?
               AND deleted=0""",
            (g.user_id, date, tx_type, amount, category, note),
        ).fetchone()
        if existing:
            skipped += 1
            continue

        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        db.execute(
            """INSERT INTO transactions (user_id, type, amount, category, tags, note, date, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (g.user_id, tx_type, amount, category, json.dumps(tags, ensure_ascii=False), note, date, now, now),
        )
        imported += 1

    if imported > 0:
        db.commit()
        bump_version(g.user_id)

    return jsonify({"imported": imported, "skipped": skipped}), 200


# ──────────────────────────────────────────────
# 管理员端点：邀请码管理
# ──────────────────────────────────────────────

@app.route("/tide/api/admin/invites", methods=["GET"])
@require_admin
def admin_list_invites():
    db = get_db()
    rows = db.execute(
        "SELECT * FROM invite_codes ORDER BY created_at DESC"
    ).fetchall()
    return jsonify([row_to_dict(r) for r in rows]), 200


@app.route("/tide/api/admin/invites", methods=["POST"])
@require_admin
def admin_create_invite():
    data = request.get_json(silent=True) or {}
    max_uses = data.get("max_uses", 1)
    if not isinstance(max_uses, int) or max_uses < 1:
        max_uses = 1

    code = secrets.token_urlsafe(16)
    db = get_db()
    db.execute(
        "INSERT INTO invite_codes (code, created_by, max_uses) VALUES (?, ?, ?)",
        (code, "admin", max_uses),
    )
    db.commit()

    row = db.execute("SELECT * FROM invite_codes WHERE code = ?", (code,)).fetchone()
    return jsonify(row_to_dict(row)), 201


@app.route("/tide/api/admin/invites/<int:invite_id>", methods=["DELETE"])
@require_admin
def admin_delete_invite(invite_id):
    db = get_db()
    db.execute("DELETE FROM invite_codes WHERE id = ?", (invite_id,))
    db.commit()
    return jsonify({"deleted": True}), 200


# ──────────────────────────────────────────────
# 模块级初始化（Gunicorn 必须在顶层调用）
# ──────────────────────────────────────────────

init_db()

# ──────────────────────────────────────────────
# 开发调试入口
# ──────────────────────────────────────────────

if __name__ == "__main__":
    # 开发时确保目录存在
    Path(DB_PATH).parent.mkdir(parents=True, exist_ok=True)
    # 生成 master key（如果不存在）
    mk_path = Path(MASTERKEY_PATH)
    if not mk_path.exists():
        mk_path.parent.mkdir(parents=True, exist_ok=True)
        mk = secrets.token_urlsafe(32)
        mk_path.write_text(mk)
        print(f"[DEV] Generated master key: {mk}")
    app.run(host="0.0.0.0", port=5000, debug=True)
