import datetime as dt
import hashlib
import re
import secrets

from flask import Blueprint, current_app, g
from flask_jwt_extended import create_access_token

from extensions import db
from models import (BUSINESS_TYPES, OWNER, VIEWER, Invite, PasswordReset, TokenBlocklist, User, Workspace, utcnow)
from services.mailer import send_mail
from utils import (ApiError, audit, body, clean_text, fail, ok, permission_list, rate_limit, require)

bp = Blueprint("auth", __name__, url_prefix="/api/auth")
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]{2,}$")
COMMON = {"password", "password1", "12345678", "qwerty123", "admin123", "letmein123", "welcome123", "iloveyou1"}
MAX_FAILS, LOCK_MINUTES = 5, 15


def check_password_strength(pw):
    if len(pw) < 8:
        raise ApiError("Password must be at least 8 characters.")
    if len(pw) > 128:
        raise ApiError("Password is too long.")
    if not (re.search(r"[a-z]", pw) and re.search(r"[A-Z]", pw) and re.search(r"\d", pw)):
        raise ApiError("Password must include an uppercase letter, a lowercase letter and a number.")
    if pw.lower() in COMMON:
        raise ApiError("That password is too common. Choose a stronger one.")


def session_payload(user):
    token = create_access_token(identity=str(user.id))
    return {"access_token": token, "user": {**user.to_dict(), "permissions": permission_list(user.role)},
            "workspace": user.workspace.to_dict()}


@bp.post("/register")
@rate_limit("register", 10, 3600)
def register():
    d = body()
    name = clean_text(d.get("full_name"), "Full name", 120, True)
    email = (d.get("email") or "").strip().lower()
    pw, confirm = d.get("password") or "", d.get("confirm_password") or ""
    if not EMAIL_RE.match(email) or len(email) > 160:
        raise ApiError("Enter a valid email address.")
    check_password_strength(pw)
    if pw != confirm:
        raise ApiError("Passwords do not match.")
    if User.query.filter_by(email=email).first():
        raise ApiError("An account with this email already exists.", 409)
    code = (d.get("invite_code") or "").strip()
    if code:
        inv = Invite.query.filter_by(code=code).first()
        if not inv or inv.used_at or inv.expires_at < utcnow():
            raise ApiError("This invite code is invalid or has expired.")
        ws, role = db.session.get(Workspace, inv.workspace_id), inv.role
        inv.used_at = utcnow()
    else:
        company = clean_text(d.get("company_name"), "Company name", 160, True)
        btype = d.get("business_type") or "Retail"
        if btype not in BUSINESS_TYPES:
            raise ApiError("Choose a valid business type.")
        ws, role = Workspace(name=company, business_type=btype, risk_config={}), OWNER
        db.session.add(ws)
        db.session.flush()
    user = User(workspace_id=ws.id, name=name, email=email, role=role)
    user.set_password(pw)
    db.session.add(user)
    db.session.flush()
    audit("REGISTER", f"{name} registered" + (" via invite" if code else f" and created workspace '{ws.name}'"), user, ws)
    user.last_login_at = utcnow()
    db.session.commit()
    return ok(session_payload(user), 201)


@bp.post("/login")
@rate_limit("login", 20, 60)
def login():
    d = body()
    email = (d.get("email") or "").strip().lower()
    user = User.query.filter_by(email=email).first()
    generic = "Incorrect email or password."
    if user and user.locked_until and user.locked_until > utcnow():
        return fail("Too many failed attempts. Try again in a few minutes or reset your password.", 429)
    if not user or not user.is_active or not user.check_password(d.get("password") or ""):
        if user:
            user.failed_attempts += 1
            if user.failed_attempts >= MAX_FAILS:
                user.locked_until = utcnow() + dt.timedelta(minutes=LOCK_MINUTES)
                user.failed_attempts = 0
            audit("LOGIN_FAILED", "Failed login attempt", user, user.workspace)
            db.session.commit()
        return fail(generic, 401)
    user.failed_attempts, user.locked_until, user.last_login_at = 0, None, utcnow()
    audit("LOGIN", "Signed in", user, user.workspace)
    db.session.commit()
    return ok(session_payload(user))


@bp.post("/demo-login")
@rate_limit("demo", 30, 60)
def demo_login():
    ws = Workspace.query.filter_by(is_shared_demo=True).first()
    user = ws and User.query.filter_by(workspace_id=ws.id, role=VIEWER).first()
    if not user:
        return fail("The demo workspace is not set up on this server. Run `python seed.py` first.", 404)
    return ok(session_payload(user))


@bp.post("/logout")
@require()
def logout():
    db.session.add(TokenBlocklist(jti=g.jti))
    audit("LOGOUT", "Signed out")
    db.session.commit()
    return ok({"message": "Logged out."})


@bp.get("/me")
@require()
def me():
    return ok(session_payload(g.user) | {"access_token": None})


@bp.put("/me")
@require()
def update_me():
    d, u = body(), g.user
    name = clean_text(d.get("name") or u.name, "Name", 120, True)
    email = (d.get("email") or u.email).strip().lower()
    if not EMAIL_RE.match(email):
        raise ApiError("Enter a valid email address.")
    if User.query.filter(User.email == email, User.id != u.id).first():
        raise ApiError("Another account already uses that email.", 409)
    u.name, u.email = name, email
    audit("PROFILE_UPDATED", "Updated own profile")
    db.session.commit()
    return ok(u.to_dict())


@bp.post("/change-password")
@require()
def change_password():
    d, u = body(), g.user
    if not u.check_password(d.get("current_password") or ""):
        raise ApiError("Current password is incorrect.")
    check_password_strength(d.get("new_password") or "")
    u.set_password(d["new_password"])
    audit("PASSWORD_CHANGED", "Changed own password")
    db.session.commit()
    return ok(session_payload(u))     # fresh token: older tokens are now invalid


@bp.post("/forgot-password")
@rate_limit("forgot", 5, 3600)
def forgot_password():
    email = (body().get("email") or "").strip().lower()
    user = User.query.filter_by(email=email).first()
    resp = {"message": "If an account exists for that email, a reset link has been sent."}
    if user and user.is_active and not user.workspace.is_shared_demo:
        raw = secrets.token_urlsafe(32)
        db.session.add(PasswordReset(user_id=user.id, token_hash=hashlib.sha256(raw.encode()).hexdigest(),
                                     expires_at=utcnow() + dt.timedelta(hours=1)))
        db.session.commit()
        link = f"{current_app.config['CLIENT_URL'].rstrip('/')}/reset-password?token={raw}"
        sent = send_mail(current_app, user.email, "Reset your StockGhost password",
                         f"Hi {user.name},\n\nUse this link to set a new password (valid for 1 hour):\n{link}\n\nIf you did not ask for this, ignore this email.")
        if not sent and current_app.config["APP_ENV"] != "production":
            resp["dev_reset_link"] = link        # development convenience only; never returned in production
    return ok(resp)


@bp.post("/reset-password")
@rate_limit("reset", 10, 3600)
def reset_password():
    d = body()
    check_password_strength(d.get("password") or "")
    if d.get("password") != d.get("confirm_password"):
        raise ApiError("Passwords do not match.")
    h = hashlib.sha256((d.get("token") or "").encode()).hexdigest()
    pr = PasswordReset.query.filter_by(token_hash=h).first()
    if not pr or pr.used_at or pr.expires_at < utcnow():
        raise ApiError("This reset link is invalid or has expired. Request a new one.")
    user = db.session.get(User, pr.user_id)
    user.set_password(d["password"])
    user.failed_attempts, user.locked_until = 0, None
    pr.used_at = utcnow()
    audit("PASSWORD_RESET", "Password reset via e-mail link", user, user.workspace)
    db.session.commit()
    return ok({"message": "Password updated. You can now sign in."})
