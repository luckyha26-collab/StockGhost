"""Shared helpers: response format, authentication, workspace scoping, RBAC, rate limiting, audit, parsing."""
import datetime as dt
import threading
import time
from collections import defaultdict, deque
from functools import wraps

from flask import current_app, g, jsonify, request
from flask_jwt_extended import get_jwt, verify_jwt_in_request

from extensions import db
from models import (ADMIN, ANALYST, INVENTORY_MANAGER, OWNER, SALES_MANAGER, VIEWER, AuditLog, Notification,
                    User, Workspace)


# ---- response envelope -------------------------------------------------------------------------
def ok(data=None, status=200, **extra):
    return jsonify({"success": True, "data": data, **extra}), status


def fail(message, status=400, **extra):
    return jsonify({"success": False, "message": message, **extra}), status


class ApiError(Exception):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.message, self.status = message, status


# ---- permissions (enforced on the server; the UI only mirrors them) -------------------------------
READ = ["dashboard.view", "products.read", "inventory.read", "sales.read", "purchases.read", "suppliers.read",
        "analytics.view", "reports.view", "notifications.view"]
PERMISSIONS = {
    OWNER: ["*"],
    ADMIN: ["*"],
    INVENTORY_MANAGER: READ + ["products.write", "inventory.write", "suppliers.write", "purchases.write",
                               "analytics.run", "data.import", "reports.export"],
    SALES_MANAGER: READ + ["sales.write", "data.import", "reports.export"],
    ANALYST: READ + ["analytics.run", "reports.export", "data.read"],
    VIEWER: READ,
}
OWNER_ONLY = {"workspace.delete_data"}


def can(role, perm):
    perms = PERMISSIONS.get(role, [])
    return ("*" in perms and perm not in OWNER_ONLY) or perm in perms or (role == OWNER)


def permission_list(role):
    allp = set(sum(PERMISSIONS.values(), [])) - {"*"} | {"users.manage", "settings.manage", "audit.view",
                                                       "data.manage", "data.import", "workspace.delete_data", "data.read"}
    return sorted(p for p in allp if can(role, p))


def require(perm=None):
    """Authenticate -> resolve user + workspace from the token -> check permission."""
    def deco(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            verify_jwt_in_request()
            claims = get_jwt()
            user = db.session.get(User, int(claims["sub"]))
            if not user or not user.is_active:
                return fail("Your account is not active. Please log in again.", 401)
            iat = claims.get("iat")
            if user.password_changed_at and iat and dt.datetime.utcfromtimestamp(iat) < user.password_changed_at - dt.timedelta(seconds=2):
                return fail("Your password changed. Please log in again.", 401)
            ws = db.session.get(Workspace, user.workspace_id)
            g.user, g.ws, g.jti = user, ws, claims.get("jti")
            if perm and not can(user.role, perm):
                return fail("Your role does not have permission for this action.", 403)
            if request.method not in ("GET", "HEAD", "OPTIONS") and ws.is_shared_demo and perm not in (None, "analytics.view", "reports.view"):
                return fail("The shared demo workspace is read-only. Create a free account to use your own data.", 403)
            return fn(*args, **kwargs)
        return wrapper
    return deco


def scoped(model):
    """Query restricted to the current workspace. Use this for EVERY tenant-table read."""
    return model.query.filter(model.workspace_id == g.ws.id)


def get_scoped(model, ident):
    """Fetch by id inside the current workspace; foreign ids look exactly like missing ids (404)."""
    obj = scoped(model).filter(model.id == ident).first()
    if not obj:
        raise ApiError("Record not found.", 404)
    return obj


def touch(ws=None):
    """Mark analysis as stale after business data changed."""
    ws = ws or g.ws
    ws.data_version = (ws.data_version or 0) + 1


# ---- audit & notifications ------------------------------------------------------------------------
def client_ip():
    if current_app.config.get("TRUST_PROXY"):
        return (request.headers.get("X-Forwarded-For", "").split(",")[0].strip() or request.remote_addr or "")[:45]
    return (request.remote_addr or "")[:45]


def audit(action, detail="", user=None, ws=None):
    user, ws = user or getattr(g, "user", None), ws or getattr(g, "ws", None)
    if not ws:
        return
    db.session.add(AuditLog(workspace_id=ws.id, user_id=user.id if user else None,
                            user_name=user.name if user else "System", action=action,
                            detail=(detail or "")[:500], ip=client_ip()))


def notify(ws_id, kind, title, message="", severity="info", link=None):
    db.session.add(Notification(workspace_id=ws_id, kind=kind, severity=severity, title=title[:160],
                                message=(message or "")[:500], link=link))


# ---- rate limiting (in-process sliding window; use Redis-backed limiter when running several workers) --
_hits, _lock = defaultdict(deque), threading.Lock()


def rate_limit(name, limit, window):
    def deco(fn):
        @wraps(fn)
        def wrapper(*a, **kw):
            key, now = (name, client_ip()), time.time()
            with _lock:
                q = _hits[key]
                while q and q[0] < now - window:
                    q.popleft()
                if len(q) >= limit:
                    return fail("Too many attempts. Please wait a moment and try again.", 429)
                q.append(now)
            return fn(*a, **kw)
        return wrapper
    return deco


def reset_rate_limits():
    with _lock:
        _hits.clear()


# ---- request parsing --------------------------------------------------------------------------------
def body():
    d = request.get_json(silent=True)
    if not isinstance(d, dict):
        raise ApiError("Invalid request.", 400)
    return d


def parse_date(value, name="Date", required=True):
    if value in (None, ""):
        if required:
            raise ApiError(f"{name} is required.")
        return None
    try:
        return dt.date.fromisoformat(str(value)[:10])
    except ValueError:
        raise ApiError(f"{name} must use the YYYY-MM-DD format.")


def to_int(value, name, minimum=None, maximum=None):
    try:
        f = float(value)
        if f != int(f):
            raise ValueError
        n = int(f)
    except (TypeError, ValueError):
        raise ApiError(f"{name} must be a whole number.")
    if minimum is not None and n < minimum:
        raise ApiError(f"{name} must be at least {minimum}.")
    if maximum is not None and n > maximum:
        raise ApiError(f"{name} must be at most {maximum}.")
    return n


def to_float(value, name, minimum=None, maximum=None):
    try:
        n = float(value)
        if n != n or n in (float("inf"), float("-inf")):
            raise ValueError
    except (TypeError, ValueError):
        raise ApiError(f"{name} must be a number.")
    if minimum is not None and n < minimum:
        raise ApiError(f"{name} must be at least {minimum}.")
    if maximum is not None and n > maximum:
        raise ApiError(f"{name} must be at most {maximum}.")
    return n


def clean_text(value, name, max_len=160, required=False):
    s = " ".join(str(value or "").split())
    if required and not s:
        raise ApiError(f"{name} is required.")
    if len(s) > max_len:
        raise ApiError(f"{name} must be at most {max_len} characters.")
    return s


def paginate(query, default=25, maximum=200):
    page = max(1, request.args.get("page", 1, type=int) or 1)
    per = min(maximum, max(1, request.args.get("per_page", default, type=int) or default))
    total = query.count()
    items = query.limit(per).offset((page - 1) * per).all()
    return items, {"page": page, "per_page": per, "total": total, "pages": max(1, -(-total // per))}


def apply_sort(query, columns, default):
    """columns: {'name': Model.col}. ?sort=name&dir=desc"""
    key = request.args.get("sort") or default
    col = columns.get(key) or columns[default]
    return query.order_by(col.desc() if request.args.get("dir") == "desc" else col.asc())


def inr(amount):
    """750000 -> ₹7,50,000 (Indian digit grouping)."""
    n = int(round(amount or 0))
    sign = "-" if n < 0 else ""
    s = str(abs(n))
    if len(s) > 3:
        head, tail, parts = s[:-3], s[-3:], []
        while len(head) > 2:
            parts.insert(0, head[-2:])
            head = head[:-2]
        if head:
            parts.insert(0, head)
        s = ",".join(parts) + "," + tail
    return f"{sign}₹{s}"


def inr_short(v):
    v = float(v or 0)
    if abs(v) >= 1e7:
        return f"₹{v / 1e7:.2f} Cr"
    if abs(v) >= 1e5:
        return f"₹{v / 1e5:.2f} L"
    return inr(v)
