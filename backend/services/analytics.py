"""Aggregated, workspace-scoped analytics for dashboards (computed in SQL; no raw record dumps)."""
import datetime as dt
from collections import defaultdict

from flask import request
from sqlalchemy import case, func
from sqlalchemy.orm import joinedload

from extensions import db
from models import Product, Purchase, RiskAnalysis, Sale, Supplier
from services.dsrs import LEVELS, STATUSES, get_config, latest_data_date, resolve_as_of
from services.recommendations import suggested_discount
from services.simulator import _run, _vscale


def parse_filters(ws):
    cfg = get_config(ws)
    end_ref = resolve_as_of(ws, cfg)
    rng = request.args.get("range", "30d")
    if rng == "custom":
        try:
            start = dt.date.fromisoformat(request.args.get("start", ""))
            end = dt.date.fromisoformat(request.args.get("end", ""))
        except ValueError:
            start, end = end_ref - dt.timedelta(days=29), end_ref
        if start > end:
            start, end = end, start
    else:
        days = {"7d": 7, "30d": 30, "90d": 90, "12m": 365}.get(rng, 30)
        end, start = end_ref, end_ref - dt.timedelta(days=days - 1)
    return {"start": start, "end": end, "range": rng, "category": request.args.get("category") or None,
            "product_id": request.args.get("product_id", type=int), "supplier_id": request.args.get("supplier_id", type=int),
            "warehouse": request.args.get("warehouse") or None, "region": request.args.get("region") or None}


def _product_filters(q, f):
    if f["category"]:
        q = q.filter(Product.category == f["category"])
    if f["product_id"]:
        q = q.filter(Product.id == f["product_id"])
    if f["supplier_id"]:
        q = q.filter(Product.supplier_id == f["supplier_id"])
    if f["warehouse"]:
        q = q.filter(Product.warehouse == f["warehouse"])
    return q


def _bucket(d, start, end):
    span = (end - start).days + 1
    if span <= 31:
        return d.isoformat()
    if span <= 120:
        return (d - dt.timedelta(days=d.weekday())).isoformat()
    return d.strftime("%Y-%m")


def _labels(start, end):
    out, d = [], start
    while d <= end:
        k = _bucket(d, start, end)
        if k not in out:
            out.append(k)
        d += dt.timedelta(days=1)
    return out


def filter_options(ws_id):
    cats = [c for (c,) in db.session.query(Product.category).filter(Product.workspace_id == ws_id).distinct().order_by(Product.category)]
    sups = [{"id": s.id, "name": s.name} for s in Supplier.query.filter_by(workspace_id=ws_id).order_by(Supplier.name)]
    whs = [w for (w,) in db.session.query(Product.warehouse).filter(Product.workspace_id == ws_id, Product.warehouse.isnot(None)).distinct().order_by(Product.warehouse)]
    regs = [r for (r,) in db.session.query(Sale.region).filter(Sale.workspace_id == ws_id, Sale.region.isnot(None)).distinct().order_by(Sale.region)]
    return {"categories": cats, "suppliers": sups, "warehouses": whs, "regions": regs}


def counts(ws):
    n_p = Product.query.filter_by(workspace_id=ws.id).count()
    n_s = Sale.query.filter_by(workspace_id=ws.id).count()
    n_u = Purchase.query.filter_by(workspace_id=ws.id).count()
    return {"products": n_p, "sales": n_s, "purchases": n_u, "records_analyzed": n_p + n_s + n_u}


def freshness(ws):
    cfg = get_config(ws)
    latest = latest_data_date(ws.id)
    as_of = resolve_as_of(ws, cfg)
    age = (dt.date.today() - latest).days if latest else None
    return {"last_analysis_at": ws.last_analysis_at.isoformat() + "Z" if ws.last_analysis_at else None,
            "analysis_stale": ws.analyzed_version != ws.data_version, "counts": counts(ws),
            "latest_data_date": latest.isoformat() if latest else None, "as_of": as_of.isoformat(), "as_of_mode": cfg["as_of"],
            "data_is_old": bool(latest and age > 45 and cfg["as_of"] == "today"), "data_age_days": age}


def risk_base(ws_id, f=None):
    q = (RiskAnalysis.query.filter(RiskAnalysis.workspace_id == ws_id).join(Product, Product.id == RiskAnalysis.product_id)
         .options(joinedload(RiskAnalysis.product).joinedload(Product.supplier)))
    return _product_filters(q, f) if f else q


def dashboard(ws):
    f = parse_filters(ws)
    wid = ws.id
    c = counts(ws)
    out = {"has_data": c["products"] > 0, "freshness": freshness(ws), "filters": filter_options(wid),
           "period": {"start": f["start"].isoformat(), "end": f["end"].isoformat(), "range": f["range"]}}
    if not c["products"]:
        return out
    # --- risk / inventory snapshot ---------------------------------------------------------------------------
    rq = _product_filters(db.session.query(RiskAnalysis).join(Product, Product.id == RiskAnalysis.product_id)
                          .filter(RiskAnalysis.workspace_id == wid), f)
    tot = rq.with_entities(func.coalesce(func.sum(RiskAnalysis.inventory_value), 0), func.coalesce(func.sum(RiskAnalysis.blocked_capital), 0),
                           func.coalesce(func.avg(RiskAnalysis.dsrs_score), 0), func.coalesce(func.sum(Product.quantity), 0), func.count()).one()
    inv_value, blocked, avg_dsrs, units, n = tot
    by_level = {l: {"level": l, "count": 0, "inventory_value": 0.0, "blocked_capital": 0.0} for l in LEVELS}
    for lv, k, v, b in rq.with_entities(RiskAnalysis.risk_level, func.count(), func.sum(RiskAnalysis.inventory_value), func.sum(RiskAnalysis.blocked_capital)).group_by(RiskAnalysis.risk_level):
        by_level[lv] = {"level": lv, "count": k, "inventory_value": round(v or 0, 2), "blocked_capital": round(b or 0, 2)}
    by_status = {s: {"status": s, "count": 0, "inventory_value": 0.0} for s in STATUSES}
    for st, k, v in rq.with_entities(RiskAnalysis.stock_status, func.count(), func.sum(RiskAnalysis.inventory_value)).group_by(RiskAnalysis.stock_status):
        by_status[st] = {"status": st, "count": k, "inventory_value": round(v or 0, 2)}
    stockout = rq.filter(RiskAnalysis.stockout_risk == "HIGH").count()
    by_cat = [{"category": cat, "blocked_capital": round(b or 0, 2), "inventory_value": round(v or 0, 2)}
              for cat, b, v in rq.with_entities(Product.category, func.sum(RiskAnalysis.blocked_capital), func.sum(RiskAnalysis.inventory_value))
              .group_by(Product.category).order_by(func.sum(RiskAnalysis.blocked_capital).desc()).limit(12)]
    top = [r.to_dict() for r in (risk_base(wid, f).order_by(RiskAnalysis.dsrs_score.desc(), RiskAnalysis.blocked_capital.desc()).limit(10))]
    # potential recovery (estimate): apply the suggested discount tier to every blocked product
    recovery = 0.0
    cfg = get_config(ws)
    pairs = risk_base(wid, f).filter(RiskAnalysis.blocked_capital > 0).all()
    if pairs:
        vs = _vscale(ws, cfg, [r for r in pairs])
        for r in pairs:
            d = suggested_discount(r.dsrs_score)
            if d:
                recovery += _run(r.product, r, cfg, vs, d)["capital_recovered"]
    # --- sales in period ------------------------------------------------------------------------------------------------
    def sales_q(start, end):
        q = (db.session.query(Sale).join(Product, Product.id == Sale.product_id)
             .filter(Sale.workspace_id == wid, Sale.sale_date >= start, Sale.sale_date <= end))
        q = _product_filters(q, f)
        return q.filter(Sale.region == f["region"]) if f["region"] else q
    rev_expr = Sale.quantity * func.coalesce(Sale.unit_price, 0)
    sq = sales_q(f["start"], f["end"])
    revenue, units_sold, cogs = sq.with_entities(func.coalesce(func.sum(rev_expr), 0), func.coalesce(func.sum(Sale.quantity), 0),
                                                 func.coalesce(func.sum(Sale.quantity * Product.cost_price), 0)).one()
    span = (f["end"] - f["start"]).days + 1
    prev_rev = sales_q(f["start"] - dt.timedelta(days=span), f["start"] - dt.timedelta(days=1)).with_entities(func.coalesce(func.sum(rev_expr), 0)).scalar()
    labels = _labels(f["start"], f["end"])
    rev_s, units_s, pur_s = defaultdict(float), defaultdict(int), defaultdict(float)
    for d, r, u in sq.with_entities(Sale.sale_date, func.sum(rev_expr), func.sum(Sale.quantity)).group_by(Sale.sale_date):
        k = _bucket(d, f["start"], f["end"])
        rev_s[k] += r or 0
        units_s[k] += u or 0
    pq = (db.session.query(Purchase.purchase_date, func.sum(Purchase.quantity * func.coalesce(Purchase.unit_cost, 0)))
          .join(Product, Product.id == Purchase.product_id)
          .filter(Purchase.workspace_id == wid, Purchase.purchase_date >= f["start"], Purchase.purchase_date <= f["end"]))
    pq = _product_filters(pq, f)
    for d, v in pq.group_by(Purchase.purchase_date):
        pur_s[_bucket(d, f["start"], f["end"])] += v or 0
    turnover = round((float(cogs) / span * 365) / float(inv_value), 2) if inv_value else None
    out.update(
        kpis={"total_products": n, "total_units": int(units), "inventory_value": round(inv_value, 2), "blocked_capital": round(blocked, 2),
              "blocked_pct": round(blocked / inv_value * 100, 1) if inv_value else 0,
              "dead_stock_value": by_status["Dead Stock"]["inventory_value"], "dead_stock_count": by_status["Dead Stock"]["count"],
              "high_risk": by_level["HIGH"]["count"] + by_level["CRITICAL"]["count"], "slow_moving": by_status["Slow Moving"]["count"],
              "stockout_risk": stockout, "inventory_turnover": turnover, "sales_revenue": round(float(revenue), 2), "units_sold": int(units_sold),
              "revenue_change_pct": round((float(revenue) - float(prev_rev)) / float(prev_rev) * 100, 1) if prev_rev else None,
              "potential_recovery": round(recovery, 2), "average_dsrs": round(avg_dsrs, 1)},
        risk_distribution=[by_level[l] for l in LEVELS], status_distribution=[by_status[s] for s in STATUSES],
        blocked_by_category=by_cat, top_risk=top,
        series={"labels": labels, "revenue": [round(rev_s[k], 2) for k in labels], "units": [units_s[k] for k in labels],
                "purchases": [round(pur_s[k], 2) for k in labels]})
    return out


def executive(ws):
    f = parse_filters(ws)
    wid = ws.id
    out = {"has_data": Product.query.filter_by(workspace_id=wid).count() > 0, "freshness": freshness(ws)}
    if not out["has_data"]:
        return out
    d = dashboard(ws)
    k = d["kpis"]
    base = db.session.query(RiskAnalysis).join(Product, Product.id == RiskAnalysis.product_id).filter(RiskAnalysis.workspace_id == wid)
    # value-weighted DSRS -> inventory health score (100 = every rupee of stock is healthy)
    wsum = base.with_entities(func.coalesce(func.sum(RiskAnalysis.inventory_value * RiskAnalysis.dsrs_score), 0)).scalar()
    health = round(100 - (wsum / k["inventory_value"]), 1) if k["inventory_value"] else None

    def dim(col, label_expr=None, limit=12):
        label = func.coalesce(col, "Unassigned")
        rows = (base.with_entities(label, func.sum(RiskAnalysis.blocked_capital), func.sum(RiskAnalysis.inventory_value), func.count())
                .group_by(label).order_by(func.sum(RiskAnalysis.blocked_capital).desc()).limit(limit))
        return [{"name": n, "blocked_capital": round(b or 0, 2), "inventory_value": round(v or 0, 2), "products": c} for n, b, v, c in rows]
    sup_label = func.coalesce(Supplier.name, "No supplier")
    sup_rows = (base.outerjoin(Supplier, Supplier.id == Product.supplier_id)
                .with_entities(sup_label, func.sum(RiskAnalysis.blocked_capital), func.sum(RiskAnalysis.inventory_value), func.count())
                .group_by(sup_label).order_by(func.sum(RiskAnalysis.blocked_capital).desc()).limit(12))
    by_product = [{"name": r.product.name, "sku": r.product.sku, "blocked_capital": r.blocked_capital, "inventory_value": r.inventory_value, "dsrs": r.dsrs_score}
                  for r in risk_base(wid).filter(RiskAnalysis.blocked_capital > 0).order_by(RiskAnalysis.blocked_capital.desc()).limit(12)]
    out.update(kpis=k, inventory_health=health,
               dead_stock_pct=round(k["dead_stock_value"] / k["inventory_value"] * 100, 1) if k["inventory_value"] else 0,
               series=d["series"], period=d["period"], risk_distribution=d["risk_distribution"], status_distribution=d["status_distribution"],
               money_stuck={"by_category": dim(Product.category), "by_product": by_product, "by_warehouse": dim(Product.warehouse),
                            "by_supplier": [{"name": n, "blocked_capital": round(b or 0, 2), "inventory_value": round(v or 0, 2), "products": c} for n, b, v, c in sup_rows]})
    return out
