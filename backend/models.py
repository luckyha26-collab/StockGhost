"""Multi-tenant data model. Every business table carries workspace_id; every query must filter on it."""
import datetime as dt
from werkzeug.security import generate_password_hash, check_password_hash
from extensions import db

# ---- roles -------------------------------------------------------------------------------------
OWNER, ADMIN, INVENTORY_MANAGER, SALES_MANAGER, ANALYST, VIEWER = (
    "OWNER", "ADMIN", "INVENTORY_MANAGER", "SALES_MANAGER", "ANALYST", "VIEWER")
ROLES = (OWNER, ADMIN, INVENTORY_MANAGER, SALES_MANAGER, ANALYST, VIEWER)
BUSINESS_TYPES = ("Retail", "E-commerce", "Wholesale", "Manufacturing", "Electronics", "Fashion",
                  "Grocery", "Furniture", "Other")


def utcnow():
    return dt.datetime.utcnow()


def iso(d):
    return d.isoformat() if d else None


class Workspace(db.Model):
    __tablename__ = "workspaces"
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(160), nullable=False)
    business_type = db.Column(db.String(40), nullable=False, default="Retail")
    is_demo = db.Column(db.Boolean, nullable=False, default=False)          # data in this workspace is sample data
    is_shared_demo = db.Column(db.Boolean, nullable=False, default=False)   # the public read-only demo workspace
    onboarding_completed = db.Column(db.Boolean, nullable=False, default=False)
    risk_config = db.Column(db.JSON, nullable=False, default=dict)          # per-workspace overrides
    data_version = db.Column(db.Integer, nullable=False, default=1)         # bumped whenever business data changes
    analyzed_version = db.Column(db.Integer, nullable=False, default=0)
    last_analysis_at = db.Column(db.DateTime)
    created_at = db.Column(db.DateTime, default=utcnow)

    def to_dict(self):
        return {"id": self.id, "name": self.name, "business_type": self.business_type,
                "is_demo": self.is_demo, "is_shared_demo": self.is_shared_demo,
                "onboarding_completed": self.onboarding_completed,
                "last_analysis_at": iso(self.last_analysis_at),
                "analysis_stale": self.analyzed_version != self.data_version,
                "created_at": iso(self.created_at)}


class User(db.Model):
    __tablename__ = "users"
    id = db.Column(db.Integer, primary_key=True)
    workspace_id = db.Column(db.Integer, db.ForeignKey("workspaces.id"), nullable=False, index=True)
    name = db.Column(db.String(120), nullable=False)
    email = db.Column(db.String(160), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(255), nullable=False)
    role = db.Column(db.String(30), nullable=False, default=VIEWER)
    is_active = db.Column(db.Boolean, nullable=False, default=True)
    failed_attempts = db.Column(db.Integer, nullable=False, default=0)
    locked_until = db.Column(db.DateTime)
    last_login_at = db.Column(db.DateTime)
    password_changed_at = db.Column(db.DateTime, default=utcnow)
    created_at = db.Column(db.DateTime, default=utcnow)
    workspace = db.relationship("Workspace")

    def set_password(self, raw):
        self.password_hash = generate_password_hash(raw)
        self.password_changed_at = utcnow()

    def check_password(self, raw):
        return check_password_hash(self.password_hash, raw)

    def to_dict(self):
        return {"id": self.id, "name": self.name, "email": self.email, "role": self.role,
                "is_active": self.is_active, "last_login_at": iso(self.last_login_at),
                "created_at": iso(self.created_at)}


class Invite(db.Model):
    __tablename__ = "invites"
    id = db.Column(db.Integer, primary_key=True)
    workspace_id = db.Column(db.Integer, db.ForeignKey("workspaces.id"), nullable=False, index=True)
    code = db.Column(db.String(64), unique=True, nullable=False, index=True)
    role = db.Column(db.String(30), nullable=False)
    created_by = db.Column(db.Integer, db.ForeignKey("users.id"))
    expires_at = db.Column(db.DateTime, nullable=False)
    used_at = db.Column(db.DateTime)

    def to_dict(self):
        return {"id": self.id, "code": self.code, "role": self.role, "expires_at": iso(self.expires_at),
                "used": bool(self.used_at)}


class PasswordReset(db.Model):
    __tablename__ = "password_resets"
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    token_hash = db.Column(db.String(64), nullable=False, index=True)
    expires_at = db.Column(db.DateTime, nullable=False)
    used_at = db.Column(db.DateTime)


class TokenBlocklist(db.Model):
    __tablename__ = "token_blocklist"
    id = db.Column(db.Integer, primary_key=True)
    jti = db.Column(db.String(64), nullable=False, index=True)
    created_at = db.Column(db.DateTime, default=utcnow)


class Supplier(db.Model):
    __tablename__ = "suppliers"
    __table_args__ = (db.UniqueConstraint("workspace_id", "name", name="uq_supplier_ws_name"),)
    id = db.Column(db.Integer, primary_key=True)
    workspace_id = db.Column(db.Integer, db.ForeignKey("workspaces.id"), nullable=False, index=True)
    name = db.Column(db.String(160), nullable=False)
    contact = db.Column(db.String(200), default="")
    email = db.Column(db.String(160), default="")
    phone = db.Column(db.String(60), default="")
    lead_time_days = db.Column(db.Integer)
    import_id = db.Column(db.Integer, db.ForeignKey("import_jobs.id"), index=True)

    def to_dict(self):
        return {"id": self.id, "name": self.name, "contact": self.contact or "", "email": self.email or "",
                "phone": self.phone or "", "lead_time_days": self.lead_time_days}


class Product(db.Model):
    __tablename__ = "products"
    __table_args__ = (db.UniqueConstraint("workspace_id", "sku", name="uq_product_ws_sku"),
                      db.Index("ix_product_ws_cat", "workspace_id", "category"))
    id = db.Column(db.Integer, primary_key=True)
    workspace_id = db.Column(db.Integer, db.ForeignKey("workspaces.id"), nullable=False, index=True)
    name = db.Column(db.String(200), nullable=False)
    sku = db.Column(db.String(60), nullable=False)
    category = db.Column(db.String(80), nullable=False, default="Uncategorized")
    supplier_id = db.Column(db.Integer, db.ForeignKey("suppliers.id"), index=True)
    cost_price = db.Column(db.Float, nullable=False, default=0)
    selling_price = db.Column(db.Float, nullable=False, default=0)
    quantity = db.Column(db.Integer, nullable=False, default=0)
    reorder_level = db.Column(db.Integer, nullable=False, default=10)
    warehouse = db.Column(db.String(80))
    status = db.Column(db.String(20), nullable=False, default="active")          # active | discontinued
    expiry_date = db.Column(db.Date)
    stock_source = db.Column(db.String(12), nullable=False, default="manual")    # snapshot | derived | manual
    import_id = db.Column(db.Integer, db.ForeignKey("import_jobs.id"), index=True)
    created_at = db.Column(db.DateTime, default=utcnow)
    updated_at = db.Column(db.DateTime, default=utcnow, onupdate=utcnow)
    supplier = db.relationship("Supplier")

    @property
    def inventory_value(self):
        return round(self.quantity * self.cost_price, 2)

    def to_dict(self):
        return {"id": self.id, "name": self.name, "sku": self.sku, "category": self.category,
                "supplier_id": self.supplier_id, "supplier_name": self.supplier.name if self.supplier else None,
                "cost_price": self.cost_price, "selling_price": self.selling_price, "quantity": self.quantity,
                "reorder_level": self.reorder_level, "warehouse": self.warehouse, "status": self.status,
                "expiry_date": iso(self.expiry_date), "inventory_value": self.inventory_value}


class Purchase(db.Model):
    __tablename__ = "purchases"
    __table_args__ = (db.Index("ix_purchase_ws_date", "workspace_id", "purchase_date"),)
    id = db.Column(db.Integer, primary_key=True)
    workspace_id = db.Column(db.Integer, db.ForeignKey("workspaces.id"), nullable=False, index=True)
    product_id = db.Column(db.Integer, db.ForeignKey("products.id"), nullable=False, index=True)
    supplier_id = db.Column(db.Integer, db.ForeignKey("suppliers.id"), index=True)
    quantity = db.Column(db.Integer, nullable=False)
    unit_cost = db.Column(db.Float)
    purchase_date = db.Column(db.Date, nullable=False)
    received_date = db.Column(db.Date)
    reference = db.Column(db.String(80))
    import_id = db.Column(db.Integer, db.ForeignKey("import_jobs.id"), index=True)
    created_by = db.Column(db.Integer, db.ForeignKey("users.id"))
    product = db.relationship("Product")
    supplier = db.relationship("Supplier")

    def to_dict(self):
        cost = self.unit_cost if self.unit_cost is not None else (self.product.cost_price if self.product else 0)
        return {"id": self.id, "product_id": self.product_id, "product_name": self.product.name if self.product else None,
                "sku": self.product.sku if self.product else None, "quantity": self.quantity,
                "purchase_date": iso(self.purchase_date), "supplier_id": self.supplier_id,
                "supplier_name": self.supplier.name if self.supplier else None,
                "unit_cost": cost, "total_cost": round(self.quantity * cost, 2), "reference": self.reference,
                "imported": self.import_id is not None}


class Sale(db.Model):
    __tablename__ = "sales"
    __table_args__ = (db.Index("ix_sale_ws_date", "workspace_id", "sale_date"),
                      db.Index("ix_sale_ws_prod", "workspace_id", "product_id"))
    id = db.Column(db.Integer, primary_key=True)
    workspace_id = db.Column(db.Integer, db.ForeignKey("workspaces.id"), nullable=False, index=True)
    product_id = db.Column(db.Integer, db.ForeignKey("products.id"), nullable=False)
    quantity = db.Column(db.Integer, nullable=False)
    unit_price = db.Column(db.Float)
    sale_date = db.Column(db.Date, nullable=False)
    customer = db.Column(db.String(120))
    region = db.Column(db.String(80))
    order_ref = db.Column(db.String(80))
    import_id = db.Column(db.Integer, db.ForeignKey("import_jobs.id"), index=True)
    created_by = db.Column(db.Integer, db.ForeignKey("users.id"))
    product = db.relationship("Product")

    def to_dict(self):
        price = self.unit_price if self.unit_price is not None else 0
        return {"id": self.id, "product_id": self.product_id, "product_name": self.product.name if self.product else None,
                "sku": self.product.sku if self.product else None, "quantity": self.quantity,
                "unit_price": self.unit_price, "sale_date": iso(self.sale_date), "customer": self.customer,
                "region": self.region, "order_ref": self.order_ref, "revenue": round(self.quantity * price, 2),
                "imported": self.import_id is not None}


class InventoryTransaction(db.Model):
    """Stock ledger for operational movements (stock-in/out, adjustments, write-offs, snapshots)."""
    __tablename__ = "inventory_transactions"
    __table_args__ = (db.Index("ix_invtx_ws_date", "workspace_id", "date"),)
    id = db.Column(db.Integer, primary_key=True)
    workspace_id = db.Column(db.Integer, db.ForeignKey("workspaces.id"), nullable=False, index=True)
    product_id = db.Column(db.Integer, db.ForeignKey("products.id"), nullable=False, index=True)
    transaction_type = db.Column(db.String(30), nullable=False)
    quantity = db.Column(db.Integer, nullable=False)
    date = db.Column(db.Date, nullable=False, default=dt.date.today)
    note = db.Column(db.String(255), default="")
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"))
    import_id = db.Column(db.Integer, db.ForeignKey("import_jobs.id"), index=True)
    product = db.relationship("Product")
    user = db.relationship("User")

    def to_dict(self):
        return {"id": self.id, "product_id": self.product_id, "product_name": self.product.name if self.product else None,
                "sku": self.product.sku if self.product else None, "transaction_type": self.transaction_type,
                "quantity": self.quantity, "date": iso(self.date), "note": self.note or "",
                "user": self.user.name if self.user else None}


class RiskAnalysis(db.Model):
    """Latest analysis result per product (DSRS + movement metrics + forecast)."""
    __tablename__ = "risk_analysis"
    __table_args__ = (db.UniqueConstraint("workspace_id", "product_id", name="uq_risk_ws_product"),
                      db.Index("ix_risk_ws_level", "workspace_id", "risk_level"))
    id = db.Column(db.Integer, primary_key=True)
    workspace_id = db.Column(db.Integer, db.ForeignKey("workspaces.id"), nullable=False, index=True)
    product_id = db.Column(db.Integer, db.ForeignKey("products.id"), nullable=False)
    stock_age = db.Column(db.Float)                       # None = unknown (no purchase/receipt dates)
    last_sale_days = db.Column(db.Integer)                # None = never sold
    sales_frequency = db.Column(db.Float, default=0)      # sales orders per 30 days (90-day window)
    inventory_value = db.Column(db.Float, default=0)
    dsrs_score = db.Column(db.Integer, default=0)
    risk_level = db.Column(db.String(12), default="LOW")  # LOW | MEDIUM | HIGH | CRITICAL
    stock_status = db.Column(db.String(20), default="Healthy")
    blocked_capital = db.Column(db.Float, default=0)
    demand_trend = db.Column(db.Float, default=0)         # -1 .. +1
    avg_daily_demand = db.Column(db.Float, default=0)
    cover_days = db.Column(db.Float)
    units_90d = db.Column(db.Integer, default=0)
    forecast_units = db.Column(db.Float, default=0)
    forecast_method = db.Column(db.String(40))
    forecast_wape = db.Column(db.Float)
    forecast_excess = db.Column(db.Float, default=0)
    forecast_shortfall = db.Column(db.Float, default=0)
    stockout_risk = db.Column(db.String(8))               # HIGH | MEDIUM | LOW | None
    details = db.Column(db.JSON)                          # factors, reasons, data completeness
    computed_at = db.Column(db.DateTime, default=utcnow)
    product = db.relationship("Product")

    def to_dict(self):
        p = self.product
        return {"id": self.id, "product_id": self.product_id, "product_name": p.name if p else None,
                "sku": p.sku if p else None, "category": p.category if p else None,
                "supplier_name": p.supplier.name if p and p.supplier else None, "warehouse": p.warehouse if p else None,
                "quantity": p.quantity if p else 0, "cost_price": p.cost_price if p else 0,
                "selling_price": p.selling_price if p else 0,
                "stock_age": None if self.stock_age is None else round(self.stock_age, 1),
                "last_sale_days": self.last_sale_days, "sales_frequency": round(self.sales_frequency or 0, 2),
                "inventory_value": round(self.inventory_value or 0, 2), "dsrs_score": self.dsrs_score,
                "risk_level": self.risk_level, "stock_status": self.stock_status,
                "blocked_capital": round(self.blocked_capital or 0, 2), "demand_trend": round(self.demand_trend or 0, 2),
                "avg_daily_demand": round(self.avg_daily_demand or 0, 3),
                "cover_days": None if self.cover_days is None else round(self.cover_days, 1),
                "units_90d": self.units_90d, "forecast_units": round(self.forecast_units or 0, 1),
                "forecast_method": self.forecast_method, "forecast_wape": self.forecast_wape,
                "forecast_excess": round(self.forecast_excess or 0), "forecast_shortfall": round(self.forecast_shortfall or 0),
                "stockout_risk": self.stockout_risk, "reasons": (self.details or {}).get("reasons", []),
                "computed_at": iso(self.computed_at)}


class ImportJob(db.Model):
    """An uploaded dataset and everything that happened to it."""
    __tablename__ = "import_jobs"
    id = db.Column(db.Integer, primary_key=True)
    workspace_id = db.Column(db.Integer, db.ForeignKey("workspaces.id"), nullable=False, index=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"))
    filename = db.Column(db.String(255), nullable=False)
    stored_path = db.Column(db.String(400))
    dataset_type = db.Column(db.String(20), nullable=False)
    status = db.Column(db.String(20), nullable=False, default="uploaded")   # uploaded|validated|importing|completed|failed
    file_size = db.Column(db.Integer, default=0)
    rows_total = db.Column(db.Integer, default=0)
    rows_valid = db.Column(db.Integer, default=0)
    rows_rejected = db.Column(db.Integer, default=0)
    rows_imported = db.Column(db.Integer, default=0)
    columns = db.Column(db.JSON)
    preview = db.Column(db.JSON)
    mapping = db.Column(db.JSON)
    options = db.Column(db.JSON)
    report = db.Column(db.JSON)
    issues = db.Column(db.JSON)
    error_message = db.Column(db.String(400))
    created_at = db.Column(db.DateTime, default=utcnow)
    processed_at = db.Column(db.DateTime)
    user = db.relationship("User")

    def to_dict(self, detail=False):
        d = {"id": self.id, "filename": self.filename, "dataset_type": self.dataset_type, "status": self.status,
             "file_size": self.file_size, "rows_total": self.rows_total, "rows_valid": self.rows_valid,
             "rows_rejected": self.rows_rejected, "rows_imported": self.rows_imported,
             "uploaded_by": self.user.name if self.user else None, "created_at": iso(self.created_at),
             "processed_at": iso(self.processed_at), "error_message": self.error_message}
        if detail:
            d.update(columns=self.columns, preview=self.preview, mapping=self.mapping, options=self.options,
                     report=self.report)
        return d


class Notification(db.Model):
    __tablename__ = "notifications"
    id = db.Column(db.Integer, primary_key=True)
    workspace_id = db.Column(db.Integer, db.ForeignKey("workspaces.id"), nullable=False, index=True)
    kind = db.Column(db.String(30), nullable=False)
    severity = db.Column(db.String(10), nullable=False, default="info")      # info | warning | critical | success
    title = db.Column(db.String(160), nullable=False)
    message = db.Column(db.String(500), default="")
    link = db.Column(db.String(120))
    is_read = db.Column(db.Boolean, nullable=False, default=False)
    created_at = db.Column(db.DateTime, default=utcnow, index=True)

    def to_dict(self):
        return {"id": self.id, "kind": self.kind, "severity": self.severity, "title": self.title,
                "message": self.message, "link": self.link, "is_read": self.is_read, "created_at": iso(self.created_at)}


class AuditLog(db.Model):
    __tablename__ = "audit_logs"
    id = db.Column(db.Integer, primary_key=True)
    workspace_id = db.Column(db.Integer, db.ForeignKey("workspaces.id"), nullable=False, index=True)
    user_id = db.Column(db.Integer)
    user_name = db.Column(db.String(120))
    action = db.Column(db.String(60), nullable=False, index=True)
    detail = db.Column(db.String(500), default="")
    ip = db.Column(db.String(45))
    created_at = db.Column(db.DateTime, default=utcnow, index=True)

    def to_dict(self):
        return {"id": self.id, "user_name": self.user_name, "action": self.action, "detail": self.detail,
                "ip": self.ip, "created_at": iso(self.created_at)}
