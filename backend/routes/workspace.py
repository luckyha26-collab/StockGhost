import datetime as dt
import secrets

from flask import Blueprint, g
from sqlalchemy import delete

from extensions import db
from models import (ADMIN, BUSINESS_TYPES, OWNER, ROLES, VIEWER, AuditLog, ImportJob, Invite, InventoryTransaction, Notification, Product, Purchase,
                    RiskAnalysis, Sale, Supplier, User, Workspace, utcnow)
from routes.auth import EMAIL_RE, check_password_strength
from services import analytics
from services.demo_data import load_demo
from services.dsrs import EDITABLE, default_config, get_config, run_analysis
from utils import (ApiError, audit, body, can, clean_text, fail, get_scoped, ok, paginate, require, scoped, touch, to_float, to_int)

bp = Blueprint("workspace", __name__, url_prefix="/api")


def wipe_business_data(ws_id, keep_job_id=None):
    """Delete every business record of ONE workspace (users, audit log and settings are kept)."""
    for model in (RiskAnalysis, Sale, Purchase, InventoryTransaction, Product, Supplier, ImportJob):
        cond = [model.workspace_id == ws_id]
        if model is ImportJob and keep_job_id:
            cond.append(ImportJob.id != keep_job_id)
        db.session.execute(delete(model).where(*cond))


# ---- workspace & settings --------------------------------------------------------------------------------
@bp.get("/workspace")
@require()
def get_workspace():
    ws = g.ws
    cfg = get_config(ws)
    return ok({**ws.to_dict(), "config": cfg, "defaults": default_config(ws.business_type), "business_types": list(BUSINESS_TYPES),
               "freshness": analytics.freshness(ws), "has_data": Product.query.filter_by(workspace_id=ws.id).count() > 0})


@bp.put("/workspace")
@require("settings.manage")
def update_workspace():
    d, ws = body(), g.ws
    affects_analysis = False
    if "name" in d:
        ws.name = clean_text(d["name"], "Company name", 160, True)
    if "business_type" in d:
        if d["business_type"] not in BUSINESS_TYPES:
            raise ApiError("Choose a valid business type.")
        if d["business_type"] != ws.business_type and "config" not in d:
            ws.risk_config = {k: v for k, v in (ws.risk_config or {}).items() if k == "_runtime"}   # new profile -> reset overrides
        affects_analysis = affects_analysis or d["business_type"] != ws.business_type
        ws.business_type = d["business_type"]
    if "onboarding_completed" in d:
        ws.onboarding_completed = bool(d["onboarding_completed"])
    if isinstance(d.get("config"), dict):
        c, keep = d["config"], {}
        for k in EDITABLE:
            if k not in c:
                continue
            v = c[k]
            if k in ("blocked_threshold",):
                v = to_int(v, "Blocked-capital threshold", 1, 99)
            elif k in ("dead_days", "overstock_cover_days", "stockout_cover_days", "forecast_days"):
                v = to_int(v, k.replace("_", " ").capitalize(), 1, 3650)
            elif k == "as_of":
                if v not in ("today", "latest_data"):
                    raise ApiError("Invalid analysis date mode.")
            else:
                if not isinstance(v, dict):
                    raise ApiError("Invalid settings.")
                v = {kk: to_float(vv, kk, 0, 100000) for kk, vv in v.items()}
                if k == "weights" and sum(v.values()) <= 0:
                    raise ApiError("At least one risk weight must be above zero.")
            keep[k] = v
        ws.risk_config = {**(ws.risk_config or {}), **keep}
        affects_analysis = True
    if affects_analysis:                       # only scoring-relevant changes make the analysis stale
        touch(ws)
    audit("SETTINGS_CHANGED", "Workspace settings updated")
    db.session.commit()
    return ok(ws.to_dict())


@bp.post("/workspace/load-demo")
@require("settings.manage")
def load_demo_data():
    ws = g.ws
    if Product.query.filter_by(workspace_id=ws.id).count():
        raise ApiError("This workspace already has data. Remove it before loading sample data.", 409)
    info = load_demo(ws, g.user.id)
    ws.is_demo = True
    touch(ws)
    audit("DEMO_DATA_LOADED", f"Loaded sample data ({info['products']} products)")
    db.session.flush()
    run_analysis(ws, commit=False)
    db.session.commit()
    return ok(info)


@bp.delete("/workspace/data")
@require("workspace.delete_data")
def delete_all_data():
    ws = g.ws
    wipe_business_data(ws.id)
    ws.is_demo = False
    ws.last_analysis_at = None
    touch(ws)
    audit("DATA_DELETED", "All business data removed from workspace")
    db.session.commit()
    return ok({"message": "All business data was removed."})


# ---- team ---------------------------------------------------------------------------------------------------------
def _assignable(actor_role):
    return [r for r in ROLES if r != OWNER] if actor_role == ADMIN else list(ROLES)


@bp.get("/users")
@require("users.manage")
def list_users():
    users = scoped(User).order_by(User.id).all()
    invites = scoped(Invite).filter(Invite.used_at.is_(None), Invite.expires_at > utcnow()).all()
    return ok({"users": [u.to_dict() for u in users], "invites": [i.to_dict() for i in invites], "roles": _assignable(g.user.role)})


@bp.post("/users")
@require("users.manage")
def create_user():
    d = body()
    role = d.get("role")
    if role not in _assignable(g.user.role):
        raise ApiError("You cannot assign that role.", 403)
    email = (d.get("email") or "").strip().lower()
    if not EMAIL_RE.match(email):
        raise ApiError("Enter a valid email address.")
    check_password_strength(d.get("password") or "")
    if User.query.filter_by(email=email).first():
        raise ApiError("A user with that email already exists.", 409)
    u = User(workspace_id=g.ws.id, name=clean_text(d.get("name"), "Name", 120, True), email=email, role=role)
    u.set_password(d["password"])
    db.session.add(u)
    audit("USER_CREATED", f"Created user {email} ({role})")
    db.session.commit()
    return ok(u.to_dict(), 201)


def _guard_owner(target, new_role=None):
    if target.role == OWNER and g.user.role != OWNER:
        raise ApiError("Only an owner can change an owner.", 403)
    if target.role == OWNER and new_role != OWNER and scoped(User).filter(User.role == OWNER, User.is_active.is_(True)).count() <= 1:
        raise ApiError("The workspace must keep at least one owner.")


@bp.put("/users/<int:uid>")
@require("users.manage")
def update_user(uid):
    u, d = get_scoped(User, uid), body()
    role = d.get("role", u.role)
    if role not in _assignable(g.user.role) and role != u.role:
        raise ApiError("You cannot assign that role.", 403)
    if u.id == g.user.id and role != u.role:
        raise ApiError("You cannot change your own role.")
    _guard_owner(u, role)
    if "name" in d:
        u.name = clean_text(d["name"], "Name", 120, True)
    if "email" in d:
        email = d["email"].strip().lower()
        if not EMAIL_RE.match(email) or User.query.filter(User.email == email, User.id != u.id).first():
            raise ApiError("Enter a valid, unused email address.")
        u.email = email
    if "is_active" in d and u.id != g.user.id:
        u.is_active = bool(d["is_active"])
    if d.get("password"):
        check_password_strength(d["password"])
        u.set_password(d["password"])
    u.role = role
    audit("USER_UPDATED", f"Updated user {u.email} ({u.role})")
    db.session.commit()
    return ok(u.to_dict())


@bp.delete("/users/<int:uid>")
@require("users.manage")
def delete_user(uid):
    u = get_scoped(User, uid)
    if u.id == g.user.id:
        raise ApiError("You cannot delete your own account.")
    _guard_owner(u)
    audit("USER_DELETED", f"Deleted user {u.email}")
    db.session.delete(u)
    db.session.commit()
    return ok({"message": "User deleted."})


@bp.post("/invites")
@require("users.manage")
def create_invite():
    d = body()
    role = d.get("role")
    if role not in _assignable(g.user.role):
        raise ApiError("You cannot assign that role.", 403)
    inv = Invite(workspace_id=g.ws.id, code=secrets.token_urlsafe(12), role=role, created_by=g.user.id, expires_at=utcnow() + dt.timedelta(days=7))
    db.session.add(inv)
    audit("INVITE_CREATED", f"Invite for role {role}")
    db.session.commit()
    return ok(inv.to_dict(), 201)


@bp.delete("/invites/<int:iid>")
@require("users.manage")
def revoke_invite(iid):
    db.session.delete(get_scoped(Invite, iid))
    db.session.commit()
    return ok({"message": "Invite revoked."})


# ---- notifications & audit --------------------------------------------------------------------------------------------
@bp.get("/notifications")
@require("notifications.view")
def notifications():
    q = scoped(Notification).order_by(Notification.created_at.desc(), Notification.id.desc())
    items, page = paginate(q, 30, 100)
    unread = scoped(Notification).filter(Notification.is_read.is_(False)).count()
    return ok({"items": [n.to_dict() for n in items], "unread": unread, **page})


@bp.get("/notifications/unread-count")
@require("notifications.view")
def unread_count():
    return ok({"unread": scoped(Notification).filter(Notification.is_read.is_(False)).count()})


@bp.post("/notifications/<int:nid>/read")
@require("notifications.view")
def read_one(nid):
    get_scoped(Notification, nid).is_read = True
    db.session.commit()
    return ok({})


@bp.post("/notifications/read-all")
@require("notifications.view")
def read_all():
    scoped(Notification).update({"is_read": True})
    db.session.commit()
    return ok({})


@bp.get("/audit-log")
@require("audit.view")
def audit_log():
    from flask import request
    q = scoped(AuditLog).order_by(AuditLog.created_at.desc(), AuditLog.id.desc())
    if request.args.get("action"):
        q = q.filter(AuditLog.action == request.args["action"])
    if request.args.get("q"):
        q = q.filter(AuditLog.detail.ilike(f"%{request.args['q'][:60]}%"))
    items, page = paginate(q, 50, 200)
    actions = [a for (a,) in db.session.query(AuditLog.action).filter(AuditLog.workspace_id == g.ws.id).distinct().order_by(AuditLog.action)]
    return ok({"items": [a.to_dict() for a in items], "actions": actions, **page})
