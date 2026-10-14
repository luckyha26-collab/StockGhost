"""Products, inventory, sales, purchases, suppliers - all strictly workspace-scoped."""
import datetime as dt
import statistics

from flask import Blueprint, g, request
from sqlalchemy import func, or_
from sqlalchemy.orm import joinedload

from extensions import db
from models import (InventoryTransaction, Product, Purchase, RiskAnalysis, Sale, Supplier)
from services.dsrs import maybe_auto_refresh
from utils import (ApiError, apply_sort, audit, body, clean_text, get_scoped, ok, paginate, parse_date, require, scoped, to_float, to_int, touch)

bp = Blueprint("operations", __name__, url_prefix="/api")


def _like(q):
    return f"%{q.strip()[:60].replace('%', '').replace('_', '')}%"


def _finish(ws=None):
    touch(ws or g.ws)
    maybe_auto_refresh(g.ws)
    db.session.commit()


# ---- products -------------------------------------------------------------------------------------------------
def _supplier_id(v):
    if v in (None, "", 0, "0"):
        return None
    s = scoped(Supplier).filter(Supplier.id == int(v)).first()
    if not s:
        raise ApiError("Choose a supplier from your own supplier list.")
    return s.id


def _product_fields(d, partial=False):
    out = {}
    if not partial or "name" in d:
        out["name"] = clean_text(d.get("name"), "Product name", 200, True)
    if not partial or "sku" in d:
        out["sku"] = clean_text(d.get("sku"), "SKU", 60, True).upper()
    if not partial or "category" in d:
        out["category"] = clean_text(d.get("category") or "Uncategorized", "Category", 80, True)
    for k, label in (("cost_price", "Cost price"), ("selling_price", "Selling price")):
        if not partial or k in d:
            out[k] = to_float(d.get(k, 0), label, 0)
    if not partial or "reorder_level" in d:
        out["reorder_level"] = to_int(d.get("reorder_level", 10), "Reorder level", 0)
    if "supplier_id" in d:
        out["supplier_id"] = _supplier_id(d["supplier_id"])
    if "warehouse" in d:
        out["warehouse"] = clean_text(d["warehouse"], "Warehouse", 80) or None
    if "status" in d:
        if d["status"] not in ("active", "discontinued"):
            raise ApiError("Status must be active or discontinued.")
        out["status"] = d["status"]
    return out


@bp.get("/products")
@require("products.read")
def list_products():
    a = request.args
    q = (db.session.query(Product, RiskAnalysis).outerjoin(RiskAnalysis, RiskAnalysis.product_id == Product.id)
         .options(joinedload(Product.supplier)).filter(Product.workspace_id == g.ws.id))
    if a.get("q"):
        q = q.filter(or_(Product.name.ilike(_like(a["q"])), Product.sku.ilike(_like(a["q"]))))
    for k, col in (("category", Product.category), ("status", Product.status), ("warehouse", Product.warehouse)):
        if a.get(k):
            q = q.filter(col == a[k])
    if a.get("supplier_id", type=int):
        q = q.filter(Product.supplier_id == a.get("supplier_id", type=int))
    if a.get("level"):
        q = q.filter(RiskAnalysis.risk_level == a["level"])
    if a.get("low_stock") == "1":
        q = q.filter(Product.quantity <= Product.reorder_level)
    q = apply_sort(q, {"name": Product.name, "sku": Product.sku, "category": Product.category, "quantity": Product.quantity,
                       "selling_price": Product.selling_price, "cost_price": Product.cost_price, "value": Product.quantity * Product.cost_price,
                       "risk": RiskAnalysis.dsrs_score}, "name")
    rows, page = paginate(q)
    items = []
    for p, r in rows:
        dct = p.to_dict()
        dct["risk"] = None if not r else {"dsrs_score": r.dsrs_score, "risk_level": r.risk_level, "stock_status": r.stock_status,
                                           "blocked_capital": round(r.blocked_capital, 2)}
        items.append(dct)
    return ok({"items": items, **page})


@bp.get("/products/options")
@require("products.read")
def product_options():
    """Light list for dropdowns / autocomplete (search-as-you-type, capped)."""
    q = scoped(Product)
    if request.args.get("q"):
        q = q.filter(or_(Product.name.ilike(_like(request.args["q"])), Product.sku.ilike(_like(request.args["q"]))))
    return ok([{"id": p.id, "name": p.name, "sku": p.sku, "quantity": p.quantity, "selling_price": p.selling_price, "cost_price": p.cost_price}
               for p in q.order_by(Product.name).limit(30)])


@bp.post("/products")
@require("products.write")
def create_product():
    d = body()
    f = _product_fields(d)
    qty = to_int(d.get("quantity", 0), "Quantity", 0)
    if scoped(Product).filter(Product.sku == f["sku"]).first():
        raise ApiError(f"SKU {f['sku']} already exists.", 409)
    p = Product(workspace_id=g.ws.id, quantity=qty, stock_source="manual", **f)
    db.session.add(p)
    db.session.flush()
    if qty:
        db.session.add(InventoryTransaction(workspace_id=g.ws.id, product_id=p.id, transaction_type="OPENING_STOCK", quantity=qty,
                                            date=dt.date.today(), note="Opening stock", user_id=g.user.id))
    audit("PRODUCT_CREATED", f"{p.sku} - {p.name}")
    _finish()
    return ok(p.to_dict(), 201)


@bp.put("/products/<int:pid>")
@require("products.write")
def update_product(pid):
    p, d = get_scoped(Product, pid), body()
    f = _product_fields({**p.to_dict(), **d}, partial=True)
    if scoped(Product).filter(Product.sku == f["sku"], Product.id != pid).first():
        raise ApiError(f"SKU {f['sku']} already exists.", 409)
    for k, v in f.items():
        setattr(p, k, v)
    audit("PRODUCT_UPDATED", f"{p.sku} - {p.name}")
    _finish()
    return ok(p.to_dict())


@bp.delete("/products/<int:pid>")
@require("products.write")
def delete_product(pid):
    p = get_scoped(Product, pid)
    for m in (InventoryTransaction, Purchase, Sale, RiskAnalysis):
        m.query.filter(m.workspace_id == g.ws.id, m.product_id == pid).delete()
    audit("PRODUCT_DELETED", f"{p.sku} - {p.name} (and its history)")
    db.session.delete(p)
    _finish()
    return ok({"message": "Product and its history deleted."})


@bp.get("/products/meta")
@require("products.read")
def product_meta():
    from services.analytics import filter_options
    return ok(filter_options(g.ws.id))


# ---- inventory --------------------------------------------------------------------------------------------------------
@bp.get("/inventory/summary")
@require("inventory.read")
def inventory_summary():
    wid = g.ws.id
    tot = db.session.query(func.count(), func.coalesce(func.sum(Product.quantity), 0), func.coalesce(func.sum(Product.quantity * Product.cost_price), 0)) \
        .filter(Product.workspace_id == wid).one()
    low = scoped(Product).filter(Product.quantity <= Product.reorder_level).count()
    out_of = scoped(Product).filter(Product.quantity == 0).count()
    buckets = [("0-30 days", 0, 30), ("31-90 days", 31, 90), ("91-180 days", 91, 180), ("181-365 days", 181, 365), ("Over 365 days", 366, 10 ** 6)]
    aging = []
    for label, lo, hi in buckets:
        n, v = db.session.query(func.count(), func.coalesce(func.sum(RiskAnalysis.inventory_value), 0)).filter(
            RiskAnalysis.workspace_id == wid, RiskAnalysis.stock_age.isnot(None), RiskAnalysis.stock_age >= lo, RiskAnalysis.stock_age <= hi + 0.999,
            RiskAnalysis.inventory_value > 0).one()
        aging.append({"bucket": label, "products": n, "value": round(v, 2)})
    n, v = db.session.query(func.count(), func.coalesce(func.sum(RiskAnalysis.inventory_value), 0)).filter(
        RiskAnalysis.workspace_id == wid, RiskAnalysis.stock_age.is_(None), RiskAnalysis.inventory_value > 0).one()
    aging.append({"bucket": "Unknown (no receipt dates)", "products": n, "value": round(v, 2)})
    cats = [{"category": c, "units": int(u or 0), "value": round(v or 0, 2)} for c, u, v in
            db.session.query(Product.category, func.sum(Product.quantity), func.sum(Product.quantity * Product.cost_price))
            .filter(Product.workspace_id == wid).group_by(Product.category).order_by(func.sum(Product.quantity * Product.cost_price).desc())]
    return ok({"products": tot[0], "units": int(tot[1]), "valuation": round(tot[2], 2), "low_stock": low, "out_of_stock": out_of, "aging": aging, "by_category": cats})


@bp.get("/inventory/movements")
@require("inventory.read")
def movements():
    a = request.args
    q = scoped(InventoryTransaction).options(joinedload(InventoryTransaction.product), joinedload(InventoryTransaction.user))
    if a.get("product_id", type=int):
        q = q.filter(InventoryTransaction.product_id == a.get("product_id", type=int))
    if a.get("type"):
        q = q.filter(InventoryTransaction.transaction_type == a["type"])
    if a.get("q"):
        q = q.join(Product, Product.id == InventoryTransaction.product_id).filter(or_(Product.name.ilike(_like(a["q"])), Product.sku.ilike(_like(a["q"]))))
    q = q.order_by(InventoryTransaction.date.desc(), InventoryTransaction.id.desc())
    items, page = paginate(q)
    return ok({"items": [t.to_dict() for t in items], **page})


@bp.post("/inventory/adjust")
@require("inventory.write")
def adjust_stock():
    d = body()
    p = get_scoped(Product, to_int(d.get("product_id"), "Product", 1))
    kind, note = d.get("type"), clean_text(d.get("note"), "Note", 200)
    qty = to_int(d.get("quantity"), "Quantity", 0)
    if kind == "STOCK_IN":
        if qty < 1:
            raise ApiError("Quantity must be at least 1.")
        delta, tx = qty, "STOCK_IN"
    elif kind in ("STOCK_OUT", "WRITE_OFF"):
        if qty < 1:
            raise ApiError("Quantity must be at least 1.")
        if qty > p.quantity:
            raise ApiError(f"Only {p.quantity} units are in stock.")
        delta, tx = -qty, kind
    elif kind == "ADJUSTMENT":
        delta = qty - p.quantity
        if delta == 0:
            raise ApiError("The counted quantity equals the current stock.")
        tx, qty = ("ADJUSTMENT_IN" if delta > 0 else "ADJUSTMENT_OUT"), abs(delta)
    else:
        raise ApiError("Choose a valid adjustment type.")
    p.quantity += delta
    db.session.add(InventoryTransaction(workspace_id=g.ws.id, product_id=p.id, transaction_type=tx, quantity=qty, date=dt.date.today(),
                                        note=note or kind.replace("_", " ").title(), user_id=g.user.id))
    audit("INVENTORY_ADJUSTED", f"{p.sku}: {tx} {qty} (now {p.quantity})")
    _finish()
    return ok(p.to_dict())


# ---- sales ------------------------------------------------------------------------------------------------------------
@bp.get("/sales")
@require("sales.read")
def list_sales():
    a = request.args
    q = scoped(Sale).options(joinedload(Sale.product))
    if a.get("product_id", type=int):
        q = q.filter(Sale.product_id == a.get("product_id", type=int))
    if a.get("start"):
        q = q.filter(Sale.sale_date >= parse_date(a["start"], "Start date"))
    if a.get("end"):
        q = q.filter(Sale.sale_date <= parse_date(a["end"], "End date"))
    if a.get("region"):
        q = q.filter(Sale.region == a["region"])
    if a.get("q"):
        q = q.join(Product, Product.id == Sale.product_id).filter(or_(Product.name.ilike(_like(a["q"])), Product.sku.ilike(_like(a["q"])), Sale.customer.ilike(_like(a["q"]))))
    agg = q.with_entities(func.count(), func.coalesce(func.sum(Sale.quantity), 0), func.coalesce(func.sum(Sale.quantity * func.coalesce(Sale.unit_price, 0)), 0)).order_by(None).one()
    q = apply_sort(q, {"date": Sale.sale_date, "quantity": Sale.quantity, "price": Sale.unit_price}, "date") if a.get("sort") else q.order_by(Sale.sale_date.desc(), Sale.id.desc())
    items, page = paginate(q)
    return ok({"items": [s.to_dict() for s in items], "totals": {"records": agg[0], "units": int(agg[1]), "revenue": round(agg[2], 2)}, **page})


@bp.post("/sales")
@require("sales.write")
def create_sale():
    d = body()
    p = get_scoped(Product, to_int(d.get("product_id"), "Product", 1))
    qty = to_int(d.get("quantity"), "Quantity", 1)
    if qty > p.quantity:
        raise ApiError(f"Only {p.quantity} units of {p.name} are in stock.")
    price = to_float(d["unit_price"], "Unit price", 0) if d.get("unit_price") not in (None, "") else p.selling_price
    day = parse_date(d.get("sale_date") or dt.date.today().isoformat(), "Sale date")
    if day > dt.date.today():
        raise ApiError("Sale date cannot be in the future.")
    s = Sale(workspace_id=g.ws.id, product_id=p.id, quantity=qty, unit_price=price, sale_date=day,
             customer=clean_text(d.get("customer"), "Customer", 120) or None, region=clean_text(d.get("region"), "Region", 80) or None, created_by=g.user.id)
    p.quantity -= qty
    db.session.add(s)
    db.session.add(InventoryTransaction(workspace_id=g.ws.id, product_id=p.id, transaction_type="SALE", quantity=qty, date=day, note="Sale", user_id=g.user.id))
    audit("SALE_CREATED", f"{qty} x {p.sku}")
    _finish()
    return ok(s.to_dict(), 201)


@bp.delete("/sales/<int:sid>")
@require("sales.write")
def delete_sale(sid):
    s = get_scoped(Sale, sid)
    if s.import_id is None:                         # manual sale: put the stock back; imported history leaves stock untouched
        s.product.quantity += s.quantity
        db.session.add(InventoryTransaction(workspace_id=g.ws.id, product_id=s.product_id, transaction_type="SALE_REVERSAL", quantity=s.quantity,
                                            date=dt.date.today(), note="Sale deleted", user_id=g.user.id))
    audit("SALE_DELETED", f"{s.quantity} x {s.product.sku}")
    db.session.delete(s)
    _finish()
    return ok({"message": "Sale deleted."})


# ---- purchases --------------------------------------------------------------------------------------------------------
@bp.get("/purchases")
@require("purchases.read")
def list_purchases():
    a = request.args
    q = scoped(Purchase).options(joinedload(Purchase.product), joinedload(Purchase.supplier))
    if a.get("supplier_id", type=int):
        q = q.filter(Purchase.supplier_id == a.get("supplier_id", type=int))
    if a.get("product_id", type=int):
        q = q.filter(Purchase.product_id == a.get("product_id", type=int))
    if a.get("start"):
        q = q.filter(Purchase.purchase_date >= parse_date(a["start"], "Start date"))
    if a.get("end"):
        q = q.filter(Purchase.purchase_date <= parse_date(a["end"], "End date"))
    if a.get("q"):
        q = q.join(Product, Product.id == Purchase.product_id).filter(or_(Product.name.ilike(_like(a["q"])), Product.sku.ilike(_like(a["q"]))))
    agg = q.with_entities(func.count(), func.coalesce(func.sum(Purchase.quantity), 0),
                          func.coalesce(func.sum(Purchase.quantity * func.coalesce(Purchase.unit_cost, 0)), 0)).order_by(None).one()
    items, page = paginate(q.order_by(Purchase.purchase_date.desc(), Purchase.id.desc()))
    return ok({"items": [p.to_dict() for p in items], "totals": {"records": agg[0], "units": int(agg[1]), "cost": round(agg[2], 2)}, **page})


@bp.post("/purchases")
@require("purchases.write")
def create_purchase():
    d = body()
    p = get_scoped(Product, to_int(d.get("product_id"), "Product", 1))
    qty = to_int(d.get("quantity"), "Quantity", 1)
    sid = _supplier_id(d.get("supplier_id")) or p.supplier_id
    cost = to_float(d["unit_cost"], "Unit cost", 0) if d.get("unit_cost") not in (None, "") else p.cost_price
    day = parse_date(d.get("purchase_date") or dt.date.today().isoformat(), "Purchase date")
    if day > dt.date.today():
        raise ApiError("Purchase date cannot be in the future.")
    pu = Purchase(workspace_id=g.ws.id, product_id=p.id, supplier_id=sid, quantity=qty, unit_cost=cost, purchase_date=day, received_date=day,
                  reference=clean_text(d.get("reference"), "Reference", 80) or None, created_by=g.user.id)
    p.quantity += qty
    if not p.cost_price and cost:
        p.cost_price = cost
    db.session.add(pu)
    db.session.add(InventoryTransaction(workspace_id=g.ws.id, product_id=p.id, transaction_type="PURCHASE", quantity=qty, date=day, note="Purchase received", user_id=g.user.id))
    audit("PURCHASE_CREATED", f"{qty} x {p.sku}")
    _finish()
    return ok(pu.to_dict(), 201)


@bp.delete("/purchases/<int:pid>")
@require("purchases.write")
def delete_purchase(pid):
    pu = get_scoped(Purchase, pid)
    if pu.import_id is None:
        pu.product.quantity = max(0, pu.product.quantity - pu.quantity)
    audit("PURCHASE_DELETED", f"{pu.quantity} x {pu.product.sku}")
    db.session.delete(pu)
    _finish()
    return ok({"message": "Purchase deleted."})


# ---- suppliers --------------------------------------------------------------------------------------------------------
def _supplier_stats(wid):
    stats = {}
    for sid, n, units, val in db.session.query(Purchase.supplier_id, func.count(), func.sum(Purchase.quantity),
                                               func.sum(Purchase.quantity * func.coalesce(Purchase.unit_cost, 0))).filter(
            Purchase.workspace_id == wid, Purchase.supplier_id.isnot(None)).group_by(Purchase.supplier_id):
        stats[sid] = {"purchases": n, "units": int(units or 0), "purchase_value": round(val or 0, 2)}
    leads = {}
    for sid, pd_, rd in db.session.query(Purchase.supplier_id, Purchase.purchase_date, Purchase.received_date).filter(
            Purchase.workspace_id == wid, Purchase.supplier_id.isnot(None), Purchase.received_date.isnot(None)):
        leads.setdefault(sid, []).append((rd - pd_).days)
    return stats, leads


def _supplier_dict(s, stats, leads, blocked, nprod):
    st = stats.get(s.id, {"purchases": 0, "units": 0, "purchase_value": 0})
    ls = [x for x in leads.get(s.id, []) if x >= 0]
    d = {**s.to_dict(), **st, "products": nprod.get(s.id, 0), "blocked_capital": round(blocked.get(s.id, 0), 2),
         "avg_lead_time": round(statistics.mean(ls), 1) if ls else None, "lead_time_samples": len(ls), "reliability": None}
    if len(ls) >= 3:
        target = s.lead_time_days or statistics.median(ls)
        d["reliability"] = round(sum(1 for x in ls if x <= target * 1.1) / len(ls) * 100)      # % of deliveries within target lead time (+10%)
    return d


@bp.get("/suppliers")
@require("suppliers.read")
def list_suppliers():
    wid = g.ws.id
    stats, leads = _supplier_stats(wid)
    blocked = dict(db.session.query(Product.supplier_id, func.sum(RiskAnalysis.blocked_capital)).join(RiskAnalysis, RiskAnalysis.product_id == Product.id)
                   .filter(Product.workspace_id == wid, Product.supplier_id.isnot(None)).group_by(Product.supplier_id))
    nprod = dict(db.session.query(Product.supplier_id, func.count()).filter(Product.workspace_id == wid, Product.supplier_id.isnot(None)).group_by(Product.supplier_id))
    return ok([_supplier_dict(s, stats, leads, blocked, nprod) for s in scoped(Supplier).order_by(Supplier.name)])


@bp.get("/suppliers/<int:sid>")
@require("suppliers.read")
def supplier_detail(sid):
    s = get_scoped(Supplier, sid)
    stats, leads = _supplier_stats(g.ws.id)
    prods = scoped(Product).filter(Product.supplier_id == sid).order_by(Product.name).limit(200).all()
    pur = scoped(Purchase).filter(Purchase.supplier_id == sid).options(joinedload(Purchase.product)).order_by(Purchase.purchase_date.desc()).limit(50).all()
    total = stats.get(sid, {}).get("purchase_value", 0)
    by_prod = {}
    for p in db.session.query(Purchase.product_id, func.sum(Purchase.quantity * func.coalesce(Purchase.unit_cost, 0))).filter(Purchase.workspace_id == g.ws.id, Purchase.supplier_id == sid).group_by(Purchase.product_id):
        by_prod[p[0]] = p[1] or 0
    top_share = round(max(by_prod.values()) / total * 100, 1) if by_prod and total else None
    d = _supplier_dict(s, stats, leads, {}, {})
    d["top_product_dependency_pct"] = top_share
    months = max(1, len({(x.purchase_date.year, x.purchase_date.month) for x in pur})) if pur else 1
    d["purchases_per_month"] = round(stats.get(sid, {}).get("purchases", 0) / months, 1) if pur else 0
    return ok({"supplier": d, "products": [p.to_dict() for p in prods], "purchases": [p.to_dict() for p in pur]})


def _supplier_fields(d):
    lead = d.get("lead_time_days")
    return dict(name=clean_text(d.get("name"), "Supplier name", 160, True), contact=clean_text(d.get("contact"), "Contact", 200),
                email=clean_text(d.get("email"), "Email", 160), phone=clean_text(d.get("phone"), "Phone", 60),
                lead_time_days=None if lead in (None, "") else to_int(lead, "Lead time", 0, 365))


@bp.post("/suppliers")
@require("suppliers.write")
def create_supplier():
    f = _supplier_fields(body())
    if scoped(Supplier).filter(func.lower(Supplier.name) == f["name"].lower()).first():
        raise ApiError("A supplier with that name already exists.", 409)
    s = Supplier(workspace_id=g.ws.id, **f)
    db.session.add(s)
    audit("SUPPLIER_CREATED", s.name)
    db.session.commit()
    return ok(s.to_dict(), 201)


@bp.put("/suppliers/<int:sid>")
@require("suppliers.write")
def update_supplier(sid):
    s = get_scoped(Supplier, sid)
    f = _supplier_fields({**s.to_dict(), **body()})
    if scoped(Supplier).filter(func.lower(Supplier.name) == f["name"].lower(), Supplier.id != sid).first():
        raise ApiError("A supplier with that name already exists.", 409)
    for k, v in f.items():
        setattr(s, k, v)
    audit("SUPPLIER_UPDATED", s.name)
    db.session.commit()
    return ok(s.to_dict())


@bp.delete("/suppliers/<int:sid>")
@require("suppliers.write")
def delete_supplier(sid):
    s = get_scoped(Supplier, sid)
    Product.query.filter(Product.workspace_id == g.ws.id, Product.supplier_id == sid).update({"supplier_id": None})
    Purchase.query.filter(Purchase.workspace_id == g.ws.id, Purchase.supplier_id == sid).update({"supplier_id": None})
    audit("SUPPLIER_DELETED", s.name)
    db.session.delete(s)
    db.session.commit()
    return ok({"message": "Supplier deleted. Linked products and purchases were kept."})
