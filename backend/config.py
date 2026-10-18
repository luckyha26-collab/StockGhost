"""Environment-driven configuration. No secrets live in source code."""
import os
import secrets
from datetime import timedelta

try:
    from dotenv import load_dotenv
    load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env"))
except ImportError:  # dotenv is optional
    pass

BASE_DIR = os.path.abspath(os.path.dirname(__file__))
ROOT_DIR = os.path.abspath(os.path.join(BASE_DIR, ".."))
APP_ENV = os.environ.get("APP_ENV", "development").lower()
IS_PROD = APP_ENV == "production"


def _duration(value, default_seconds):
    """'8h', '30m', '7d', '3600' -> seconds."""
    if not value:
        return default_seconds
    v = str(value).strip().lower()
    try:
        if v[-1] in "smhd":
            return int(v[:-1]) * {"s": 1, "m": 60, "h": 3600, "d": 86400}[v[-1]]
        return int(v)
    except (ValueError, IndexError):
        return default_seconds


def _database_url():
    url = os.environ.get("DATABASE_URL", "").strip()
    if not url:
        path = os.path.join(ROOT_DIR, "database", "stockghost.db")
        os.makedirs(os.path.dirname(path), exist_ok=True)
        return "sqlite:///" + path
    if url.startswith("postgres://"):
        url = "postgresql://" + url[len("postgres://"):]
    if url.startswith("sqlite:///") and not url.startswith("sqlite:////"):
        rel = url[len("sqlite:///"):]                      # relative path -> relative to backend/
        path = os.path.abspath(os.path.join(BASE_DIR, rel))
        os.makedirs(os.path.dirname(path), exist_ok=True)
        return "sqlite:///" + path
    return url


def _jwt_secret():
    secret = os.environ.get("JWT_SECRET", "").strip()
    if secret:
        if IS_PROD and len(secret) < 32:
            raise RuntimeError("JWT_SECRET must be at least 32 characters in production.")
        return secret
    if IS_PROD:
        raise RuntimeError("JWT_SECRET is required when APP_ENV=production.")
    # Development only: generate once and keep it next to the database so sessions survive restarts.
    path = os.path.join(ROOT_DIR, "database", ".dev_jwt_secret")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    if os.path.exists(path):
        return open(path).read().strip()
    secret = secrets.token_urlsafe(48)
    with open(path, "w") as fh:
        fh.write(secret)
    return secret


UPLOAD_LIMIT_MB = int(os.environ.get("UPLOAD_LIMIT", "25"))
UPLOAD_DIR = os.path.abspath(os.environ.get("UPLOAD_DIR", os.path.join(ROOT_DIR, "uploads")))
MAX_IMPORT_ROWS = int(os.environ.get("MAX_IMPORT_ROWS", "200000"))
MAX_IMPORT_COLUMNS = int(os.environ.get("MAX_IMPORT_COLUMNS", "60"))
CLIENT_URL = os.environ.get("CLIENT_URL", "http://localhost:5173,http://localhost:5050,http://127.0.0.1:5050,http://localhost:5000,http://127.0.0.1:5000")


class Config:
    APP_ENV = APP_ENV
    SQLALCHEMY_DATABASE_URI = _database_url()
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_ENGINE_OPTIONS = {"pool_pre_ping": True}
    JWT_SECRET_KEY = _jwt_secret()
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(seconds=_duration(os.environ.get("JWT_EXPIRES_IN"), 8 * 3600))
    MAX_CONTENT_LENGTH = (UPLOAD_LIMIT_MB + 1) * 1024 * 1024
    JSON_SORT_KEYS = False
    CLIENT_URL = CLIENT_URL
    TRUST_PROXY = os.environ.get("TRUST_PROXY", "0") == "1"
    # E-mail (password reset). If SMTP_HOST is empty, reset links are written to the server log instead.
    SMTP_HOST = os.environ.get("SMTP_HOST", "")
    SMTP_PORT = int(os.environ.get("SMTP_PORT", "587"))
    SMTP_USER = os.environ.get("SMTP_USER", "")
    SMTP_PASSWORD = os.environ.get("SMTP_PASSWORD", "")
    EMAIL_FROM = os.environ.get("EMAIL_FROM", "StockGhost <no-reply@stockghost.local>")
