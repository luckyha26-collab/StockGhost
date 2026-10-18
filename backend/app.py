"""StockGhost API. Run: python app.py  |  production: gunicorn -w 2 --timeout 180 'app:create_app()'"""
import logging
import os

from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
from sqlalchemy import event
from sqlalchemy.engine import Engine
from werkzeug.exceptions import HTTPException

import config
from extensions import db, jwt
from models import TokenBlocklist
from utils import ApiError, fail

log = logging.getLogger("stockghost")
DIST = os.path.join(config.ROOT_DIR, "frontend", "dist")


@event.listens_for(Engine, "connect")
def _sqlite_pragmas(dbapi_conn, _):
    if dbapi_conn.__class__.__module__.startswith("sqlite3"):
        cur = dbapi_conn.cursor()
        cur.execute("PRAGMA foreign_keys=ON")
        cur.execute("PRAGMA journal_mode=WAL")
        cur.close()


def create_app(overrides=None):
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    app = Flask(__name__, static_folder=None)
    app.config.from_object(config.Config)
    app.config.update(overrides or {})
    CORS(app, resources={r"/api/*": {"origins": "*"}},
         allow_headers=["Content-Type", "Authorization", "X-Requested-With"],
         methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
         supports_credentials=False)
    db.init_app(app)
    jwt.init_app(app)

    @jwt.token_in_blocklist_loader
    def _revoked(_h, payload):
        return db.session.query(TokenBlocklist.id).filter_by(jti=payload["jti"]).first() is not None

    @jwt.unauthorized_loader
    @jwt.invalid_token_loader
    def _unauth(_msg):
        return fail("Please sign in to continue.", 401)

    @jwt.expired_token_loader
    def _expired(_h, _p):
        return fail("Your session has expired. Please sign in again.", 401)

    @jwt.revoked_token_loader
    def _rev(_h, _p):
        return fail("You have been signed out. Please sign in again.", 401)

    from routes import analytics, auth, imports, operations, reports, workspace
    for m in (auth, workspace, operations, imports, analytics, reports):
        app.register_blueprint(m.bp)

    @app.get("/api/health")
    def health():
        return jsonify({"success": True, "data": {"status": "ok"}})

    @app.after_request
    def _headers(resp):
        resp.headers.setdefault("X-Content-Type-Options", "nosniff")
        resp.headers.setdefault("X-Frame-Options", "DENY")
        resp.headers.setdefault("Referrer-Policy", "same-origin")
        if request.path.startswith("/api/"):
            resp.headers["Cache-Control"] = "no-store"
        elif request.path != "/" and not request.path.startswith("/assets/"):
            pass
        if app.config["APP_ENV"] == "production":
            resp.headers.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
        return resp

    @app.errorhandler(ApiError)
    def _api_error(e):
        db.session.rollback()
        return fail(e.message, e.status)

    @app.errorhandler(HTTPException)
    def _http(e):
        msgs = {404: "That resource was not found.", 405: "That action is not allowed.", 413: f"The file is larger than the {config.UPLOAD_LIMIT_MB} MB limit.",
                429: "Too many requests. Please slow down.", 400: "The request was not valid."}
        if not request.path.startswith("/api/") and e.code == 404 and os.path.isdir(DIST):
            return send_from_directory(DIST, "index.html")
        return fail(msgs.get(e.code, "Something went wrong."), e.code or 500)

    @app.errorhandler(Exception)
    def _unhandled(e):
        db.session.rollback()
        log.exception("Unhandled error on %s %s", request.method, request.path)   # full detail only in the server log
        return fail("Something went wrong on our side. Please try again.", 500)

    if os.path.isdir(DIST):                                  # optional single-process deployment of the built UI
        @app.get("/", defaults={"p": ""})
        @app.get("/<path:p>")
        def spa(p):
            if p.startswith("api/") or p == "api":          # unknown API paths must be JSON 404s, never the HTML app
                return fail("That resource was not found.", 404)
            f = os.path.join(DIST, p)
            if p and os.path.isfile(f):
                return send_from_directory(DIST, p)
            return send_from_directory(DIST, "index.html")
    else:
        root_index = os.path.join(config.ROOT_DIR, "index.html")
        if os.path.isfile(root_index):
            @app.get("/")
            def serve_root():
                return send_from_directory(config.ROOT_DIR, "index.html")

            @app.get("/index.html")
            def serve_direct():
                return send_from_directory(config.ROOT_DIR, "index.html")

            @app.get("/business_inventory_dataset.csv")
            def serve_csv():
                csv_path = os.path.join(config.ROOT_DIR, "business_inventory_dataset.csv")
                if os.path.isfile(csv_path):
                    return send_from_directory(config.ROOT_DIR, "business_inventory_dataset.csv")
                return fail("Dataset not found", 404)

    with app.app_context():
        db.create_all()
    os.makedirs(config.UPLOAD_DIR, exist_ok=True)
    return app


if __name__ == "__main__":
    application = create_app()
    application.run(host="0.0.0.0", port=int(os.environ.get("PORT", "5000")), debug=config.APP_ENV == "development")
