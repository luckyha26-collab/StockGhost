import datetime as dt
import math

from flask import Blueprint, g, request
from sqlalchemy import func, or_

from extensions import db
from models import InventoryTransaction, Product, RiskAnalysis
from services import analytics as A
from services import chatbot
from services import forecast as FC
from services.dsrs import (LEVELS, STATUSES, get_config, load_context, product_forecast, run_analysis)
from services.recommendations import all_recommendations, build_for
from services.simulator import SENSITIVITY, _vscale, simulate_portfolio, simulate_product
from utils import ApiError, apply_sort, audit, body, fail, get_scoped, notify, ok, paginate, require, scoped, to_float, to_int

bp = Blueprint("analytics", __name__, url_prefix="/api")


def _no_data():
    return Product.query.filter_by(workspace_id=g.ws.id).count() == 0


@bp.get("/analytics/dashboard")
@require("dashboard.view")
def dashboard():
    return ok(A.dashboard(g.ws))


@bp.get("/analytics/executive")
@require("dashboard.view")
def executive():
    return ok(A.executive(g.ws))


@bp.post("/analytics/refresh")
@require("analytics.run")
def refresh():
    if _no_data():
        raise ApiError("There is no data to analyse yet. Upload your data first.")
    summary = run_analysis(g.ws, commit=False)
    audit("RISK_ANALYSIS", f"Analysis refreshed: {summary['products']} products, {summary['new_high_risk']} newly high risk")
    db.session.commit()
    return ok({**summary, "freshness": A.freshness(g.ws)})


def _risk_query(default_status=None):
    a = request.args
    q = A.risk_base(g.ws.id)
    if a.get("q"):
        like = f"%{a['q'][:60].replace('%', '')}%"
        q = q.filter(or_(Product.name.ilike(like), Product.sku.ilike(like)))
    if a.get("category"):
        q = q.filter(Product.category == a["category"])
    if a.get("supplier_id", type=int):
        q = q.filter(Product.supplier_id == a.get("supplier_id", type=int))
    if a.get("warehouse"):
        q = q.filter(Product.warehouse == a["warehouse"])
    if a.get("level") in LEVELS:
        q = q.filter(RiskAnalysis.risk_level == a["level"])
    st = a.get("status") or default_status
    if st in STATUSES:
        q = q.filter(RiskAnalysis.stock_status == st)
    if a.get("stockout") in ("HIGH", "MEDIUM", "LOW"):
        q = q.filter(RiskAnalysis.stockout_risk == a["stockout"])
    return q


SORTS = {"score": RiskAnalysis.dsrs_score, "value": RiskAnalysis.inventory_value, "blocked": RiskAnalysis.blocked_capital, "name": Product.name,
         "last_sale": RiskAnalysis.last_sale_days, "age": RiskAnalysis.stock_age, "quantity": Product.quantity, "velocity": RiskAnalysis.avg_daily_demand,
         "forecast": RiskAnalysis.forecast_units, "excess": RiskAnalysis.forecast_excess, "shortfall": RiskAnalysis.forecast_shortfall}


@bp.get("/analytics/risk")
@require("analytics.view")
def risk_list():
    q = _risk_query()
    if not request.args.get("sort"):
        q = q.order_by(RiskAnalysis.dsrs_score.desc(), RiskAnalysis.blocked_capital.desc())
    else:
        q = apply_sort(q, SORTS, "score")
    items, page = paginate(q)
    counts = dict(db.session.query(RiskAnalysis.risk_level, func.count()).filter(RiskAnalysis.workspace_id == g.ws.id).group_by(RiskAnalysis.risk_level).all())
    return ok({"items": [r.to_dict() for r in items], "level_counts": {l: counts.get(l, 0) for l in LEVELS}, "freshness": A.freshness(g.ws), **page})


@bp.get("/analytics/dead-stock")
@require("analytics.view")
def dead_stock():
    q = _risk_query()
    q = apply_sort(q, SORTS, "value") if request.args.get("sort") else q.order_by(RiskAnalysis.inventory_value.desc())
    items, page = paginate(q)
    summ = {s: {"count": 0, "value": 0.0} for s in STATUSES}
    for st, n, v in db.session.query(RiskAnalysis.stock_status, func.count(), func.sum(RiskAnalysis.inventory_value)).filter(RiskAnalysis.workspace_id == g.ws.id).group_by(RiskAnalysis.stock_status):
        summ[st] = {"count": n, "value": round(v or 0, 2)}
    cfg = get_config(g.ws)
    rows = []
    for r in items:
        d = r.to_dict()
        rec = build_for(g.ws, cfg, _vscale(g.ws, cfg, [r]), r.product, r)
        d["recommended_action"] = rec["action"] if rec else "No action needed"
        rows.append(d)
    return ok({"items": rows, "summary": summ, "filters": A.filter_options(g.ws.id), **page})


@bp.get("/analytics/risk/<int:pid>")
@require("analytics.view")
def risk_detail(pid):
    p = get_scoped(Product, pid)
    r = scoped(RiskAnalysis).filter(RiskAnalysis.product_id == pid).first()
    if not r:
        raise ApiError("This product has not been analysed yet. Refresh the analysis.", 404)
    cfg = get_config(g.ws)
    det = r.details or {}
    known = [f for f in det.get("factors", []) if f["risk"] is not None]
    wsum = sum(f["weight"] for f in known) or 1
    factors = [{**f, "points": None if f["risk"] is None else round(100 * f["weight"] * f["risk"] / wsum, 1)} for f in det.get("factors", [])]
    rec = build_for(g.ws, cfg, _vscale(g.ws, cfg, [r]), p, r)
    hist = scoped(InventoryTransaction).filter(InventoryTransaction.product_id == pid).order_by(InventoryTransaction.date.desc()).limit(15).all()
    return ok({**r.to_dict(), "factors": factors, "missing_factors": det.get("missing_factors", []), "product": p.to_dict(), "recommendation": rec,
               "recent_movements": [t.to_dict() for t in hist]})


# ---- forecasting ------------------------------------------------------------------------------------------------------
@bp.get("/analytics/forecast")
@require("analytics.view")
def forecast_list():
    a = request.args
    q = _risk_query()
    flag = a.get("flag")
    if flag == "stockout":
        q = q.filter(RiskAnalysis.stockout_risk.in_(("HIGH", "MEDIUM")))
    elif flag == "overstock":
        q = q.filter(RiskAnalysis.forecast_excess > 0, RiskAnalysis.stock_status.in_(("Overstock", "Dead Stock", "Slow Moving")))
    elif flag == "limited":
        q = q.filter(RiskAnalysis.forecast_method == "average_velocity")
    q = apply_sort(q, SORTS, "shortfall") if a.get("sort") else q.order_by(RiskAnalysis.forecast_shortfall.desc(), RiskAnalysis.forecast_excess.desc())
    items, page = paginate(q)
    wid = g.ws.id
    methods = dict(db.session.query(RiskAnalysis.forecast_method, func.count()).filter(RiskAnalysis.workspace_id == wid).group_by(RiskAnalysis.forecast_method).all())
    cfg = get_config(g.ws)
    return ok({"items": [r.to_dict() | {"expected_stock": round(r.product.quantity - r.forecast_units)} for r in items],
               "summary": {"stockout_high": RiskAnalysis.query.filter_by(workspace_id=wid, stockout_risk="HIGH").count(),
                           "stockout_medium": RiskAnalysis.query.filter_by(workspace_id=wid, stockout_risk="MEDIUM").count(),
                           "overstock": RiskAnalysis.query.filter(RiskAnalysis.workspace_id == wid, RiskAnalysis.forecast_excess > 0,
                                                                  RiskAnalysis.stock_status.in_(("Overstock", "Dead Stock"))).count(),
                           "statistical": sum(v for k, v in methods.items() if k and k != "average_velocity"),
                           "limited_history": methods.get("average_velocity", 0), "methods": {FC.METHOD_LABELS.get(k, k): v for k, v in methods.items() if k}},
               "horizon_days": cfg["forecast_days"], "method_note": "Statistical forecasting (moving average / exponential smoothing / damped Holt trend, chosen by hold-out accuracy). Not machine learning.",
               **page})


@bp.get("/analytics/forecast/<int:pid>")
@require("analytics.view")
def forecast_detail(pid):
    p = get_scoped(Product, pid)
    ctx = load_context(g.ws, [pid])
    m, cfg, as_of = ctx["metrics"][pid], ctx["cfg"], ctx["as_of"]
    horizon = int(cfg["forecast_days"])
    f = product_forecast(m, horizon)
    n = len(m["series"])
    history = [{"week": (as_of - dt.timedelta(days=7 * (n - 1 - i))).isoformat(), "units": u} for i, u in enumerate(m["series"])]
    future = [{"week": (as_of + dt.timedelta(days=7 * (i + 1))).isoformat(), "units": u} for i, u in enumerate(f["weekly_forecast"])]
    limited = f["method"] == "average_velocity"
    return ok({"product": p.to_dict(), "method": f["method"], "method_label": FC.METHOD_LABELS[f["method"]], "limited": limited,
               "message": ("Not enough sales history for statistical forecasting (needs at least 8 weeks with 3 or more selling weeks). "
                           "Showing the average daily velocity instead - treat it as a rough guide.") if limited else None,
               "horizon_days": horizon, "forecast_units": round(f["units"], 1), "low": None if f["low"] is None else round(f["low"], 1),
               "high": None if f["high"] is None else round(f["high"], 1), "wape": f["wape"],
               "accuracy_pct": None if f["wape"] is None else max(0, round((1 - f["wape"]) * 100)), "holdout_weeks": f["holdout_weeks"],
               "history": history, "forecast": future, "current_stock": p.quantity, "expected_stock": round(p.quantity - f["units"], 1)})


# ---- recommendations & simulator ----------------------------------------------------------------------------------------
@bp.get("/analytics/recommendations")
@require("analytics.view")
def recommendations():
    recs = all_recommendations(g.ws, request.args.get("category") or None, request.args.get("tier") or None)
    counts, rec_total = {}, 0.0
    for r in recs:
        counts[r["priority"]] = counts.get(r["priority"], 0) + 1
        rec_total += (r["estimate"] or {}).get("capital_recovery", 0) or 0
    q = (request.args.get("q") or "").lower()
    if q:
        recs = [r for r in recs if q in (r["product_name"] or "").lower() or q in (r["sku"] or "").lower()]
    page, per = max(1, request.args.get("page", 1, type=int)), min(100, request.args.get("per_page", 25, type=int))
    total = len(recs)
    return ok({"items": recs[(page - 1) * per: page * per], "total": total, "page": page, "per_page": per, "pages": max(1, math.ceil(total / per)),
               "priority_counts": counts, "estimated_recovery": round(rec_total, 2),
               "note": "All financial effects are estimates from the simulator's clearance model, not guaranteed results."})


@bp.post("/analytics/simulate")
@require("analytics.view")
def simulate():
    d, ws = body(), g.ws
    disc = to_float(d.get("discount", 0), "Discount", 0, 90)
    dem = to_float(d.get("demand_change", 0), "Demand change", -90, 500)
    horizon = to_int(d.get("horizon", 30), "Forecast period", 7, 365)
    sens = to_float(d.get("sensitivity", SENSITIVITY), "Price sensitivity", 0.5, 6)
    if _no_data():
        raise ApiError("There is no data to simulate yet. Upload your data first.")
    if d.get("mode", "product") == "product":
        p = get_scoped(Product, to_int(d.get("product_id"), "Product", 1))
        r = scoped(RiskAnalysis).filter(RiskAnalysis.product_id == p.id).first()
        if not r:
            raise ApiError("Run the analysis first.")
        return ok({"mode": "product", **simulate_product(ws, p, r, disc, dem, to_int(d.get("purchase_qty", 0), "Purchase quantity", 0, 10_000_000), horizon, sens)})
    sc = d.get("scope") or {}
    mode, n = sc.get("mode", "blocked"), to_int(sc.get("top_n", 10), "Number of products", 1, 500)
    q = A.risk_base(ws.id)
    if mode == "top_dead":
        q = q.filter(RiskAnalysis.stock_status == "Dead Stock").order_by(RiskAnalysis.inventory_value.desc()).limit(n)
    elif mode == "category":
        q = q.filter(Product.category == sc.get("category")).order_by(RiskAnalysis.blocked_capital.desc()).limit(1000)
    elif mode == "all":
        q = q.order_by(RiskAnalysis.blocked_capital.desc()).limit(1000)
    else:
        q = q.filter(RiskAnalysis.blocked_capital > 0).order_by(RiskAnalysis.blocked_capital.desc()).limit(1000)
    rows = q.all()
    if not rows:
        raise ApiError("No products match that scope.")
    return ok({"mode": "portfolio", **simulate_portfolio(ws, [(r.product, r) for r in rows], disc, dem, horizon, sens)})


@bp.post("/chatbot")
@require("analytics.view")
def copilot():
    msg = (body().get("message") or "")[:500]
    return ok(chatbot.answer(g.ws, msg))
