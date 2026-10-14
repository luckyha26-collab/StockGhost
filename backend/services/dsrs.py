"""Dead Stock Risk Score (DSRS) engine - rule-based analytics (not machine learning).

DSRS (0-100) is a weighted blend of normalised risk factors (0 = safe, 1 = worst). Default weights:

    stock_age 25 | last_sale 25 | sales_frequency 15 | inventory_value 10 | quantity 10 | demand_trend 15

Business profiles re-weight these (e.g. fashion adds `seasonality`, grocery adds `expiry`, electronics
leans on demand decline, furniture relaxes the time scales). A factor whose data is missing (for example
stock age when no purchase dates were uploaded) is dropped and the remaining weights are re-normalised, so
a missing column never silently counts as "safe" or "risky".

Risk levels: 0-30 LOW | 31-60 MEDIUM | 61-80 HIGH | 81-100 CRITICAL.
Blocked capital = qty x cost price of products scoring above `blocked_threshold`.
"""
import copy
import datetime as dt
import math
from collections import defaultdict

from sqlalchemy import delete, func

from extensions import db
from models import (InventoryTransaction, Notification, Product, Purchase, RiskAnalysis, Sale, Workspace, utcnow)
from services import forecast as fc
from utils import inr_short, notify

LEVELS = ("LOW", "MEDIUM", "HIGH", "CRITICAL")
LEVEL_LABELS = {"LOW": "Low", "MEDIUM": "Medium", "HIGH": "High", "CRITICAL": "Critical"}
STATUSES = ("Dead Stock", "Slow Moving", "Healthy", "Fast Moving", "Overstock", "Stockout Risk")
INFLOW_TX = ("OPENING_STOCK", "ADJUSTMENT_IN", "STOCK_IN", "TRANSFER_IN")
FACTOR_LABELS = {"stock_age": "Stock age", "last_sale": "Days since last sale", "sales_frequency": "Sales velocity / cover",
                 "inventory_value": "Inventory value", "quantity": "Quantity vs reorder level",
                 "demand_trend": "Demand trend", "seasonality": "Seasonal demand", "expiry": "Shelf life / expiry"}

BASE_CONFIG = {
    "blocked_threshold": 60, "dead_days": 90, "overstock_cover_days": 180, "stockout_cover_days": 14,
    "forecast_days": 30, "as_of": "today", "value_scale": None,
    "scales": {"stock_age": 300, "last_sale": 180, "cover": 365, "overstock_mult": 6, "expiry_window": 60},
    "weights": {"stock_age": 25, "last_sale": 25, "sales_frequency": 15, "inventory_value": 10, "quantity": 10,
                "demand_trend": 15, "seasonality": 0, "expiry": 0},
}
PROFILES = {
    "Retail": {},
    "E-commerce": {"weights": {"last_sale": 25, "demand_trend": 20, "stock_age": 20, "sales_frequency": 15}},
    "Wholesale": {"dead_days": 120, "weights": {"quantity": 15, "inventory_value": 15, "stock_age": 20}},
    "Manufacturing": {"dead_days": 180, "overstock_cover_days": 270, "scales": {"stock_age": 365, "last_sale": 240, "cover": 450}},
    "Electronics": {"dead_days": 75, "weights": {"demand_trend": 25, "stock_age": 20, "last_sale": 25, "sales_frequency": 15, "quantity": 5, "inventory_value": 10},
                    "scales": {"stock_age": 240}},
    "Fashion": {"dead_days": 75, "weights": {"seasonality": 15, "demand_trend": 15, "stock_age": 20, "last_sale": 20, "sales_frequency": 10, "inventory_value": 10, "quantity": 10},
                "scales": {"stock_age": 210, "last_sale": 120}},
    "Grocery": {"dead_days": 21, "overstock_cover_days": 45, "stockout_cover_days": 5,
                "weights": {"expiry": 25, "stock_age": 15, "last_sale": 20, "sales_frequency": 15, "demand_trend": 10, "inventory_value": 5, "quantity": 10},
                "scales": {"stock_age": 60, "last_sale": 30, "cover": 60, "expiry_window": 45}},
    "Furniture": {"dead_days": 240, "overstock_cover_days": 365, "stockout_cover_days": 21,
                  "weights": {"stock_age": 20, "last_sale": 20, "sales_frequency": 20, "inventory_value": 15, "quantity": 10, "demand_trend": 15},
                  "scales": {"stock_age": 540, "last_sale": 365, "cover": 730}},
    "Other": {},
}
EDITABLE = ("blocked_threshold", "dead_days", "overstock_cover_days", "stockout_cover_days", "forecast_days", "as_of",
            "weights", "scales")


def _merge(a, b):
    out = copy.deepcopy(a)
    for k, v in (b or {}).items():
        out[k] = _merge(out[k], v) if isinstance(v, dict) and isinstance(out.get(k), dict) else copy.deepcopy(v)
    return out


def get_config(ws):
    stored = {k: v for k, v in (ws.risk_config or {}).items() if k != "_runtime"}
    return _merge(_merge(BASE_CONFIG, PROFILES.get(ws.business_type, {})), stored)


def default_config(business_type):
    return _merge(BASE_CONFIG, PROFILES.get(business_type, {}))


def clamp(x):
    return max(0.0, min(1.0, x))


def risk_level_for(score):
    return "LOW" if score <= 30 else "MEDIUM" if score <= 60 else "HIGH" if score <= 80 else "CRITICAL"


# ---- pure scoring (shared with the simulator) -----------------------------------------------------------
def score_components(qty, cost, reorder, m, cfg, vscale):
    """Return (score, factors{key: 0..1|None}, extras). No DB access."""
    sc, w = cfg["scales"], cfg["weights"]
    value = qty * cost
    if qty <= 0:
        return 0, {k: 0.0 for k in w}, {"cover_days": None, "trend": 0.0, "velocity": 0.0, "value": 0.0}
    window = m.get("window_days") or 90
    velocity = m["units_90"] / float(window)
    cover = qty / velocity if velocity > 0 else math.inf
    recent, prev = m["recent_units"], m["prev_units"]
    trend = 0.0 if recent + prev == 0 else (recent - prev) / max(recent, prev)
    f = {
        "stock_age": None if m.get("stock_age") is None else clamp(m["stock_age"] / sc["stock_age"]),
        "last_sale": (clamp(m["last_sale_days"] / sc["last_sale"]) if m.get("last_sale_days") is not None
                      else (1.0 if m.get("has_sales_data") else None)),
        "sales_frequency": 1.0 if math.isinf(cover) else clamp(cover / sc["cover"]),
        "inventory_value": clamp(math.sqrt(value / vscale)) if cost > 0 else None,
        "quantity": clamp(qty / (max(reorder, 1) * sc["overstock_mult"])),
        "demand_trend": (1.0 if recent + prev == 0 else clamp((1 - trend) / 2)) if m.get("has_sales_data") else None,
        "seasonality": None if m.get("season_idx") is None else clamp(1 - m["season_idx"]),
        "expiry": None if m.get("expiry_days") is None else clamp(1 - m["expiry_days"] / sc["expiry_window"]),
    }
    num = den = 0.0
    for k, weight in w.items():
        if weight > 0 and f.get(k) is not None:
            num += weight * f[k]
            den += weight
    score = int(round(100 * num / den)) if den else 0
    return max(0, min(100, score)), f, {"cover_days": None if math.isinf(cover) else cover, "trend": trend,
                                         "velocity": velocity, "value": value}


def classify(qty, m, extra, cfg, is_fast, stockout):
    if qty <= 0:
        return "Stockout Risk" if m["units_90"] > 0 else "Healthy"
    if stockout in ("HIGH",):
        return "Stockout Risk"
    never = m.get("last_sale_days") is None
    if m.get("has_sales_data") and (never or m["last_sale_days"] >= cfg["dead_days"]):
        return "Dead Stock"
    cover = extra["cover_days"]
    if cover is not None and cover > cfg["overstock_cover_days"]:
        return "Overstock"
    if cover is None and m.get("has_sales_data"):
        return "Dead Stock"
    if m.get("has_sales_data") and (m["last_sale_days"] >= cfg["dead_days"] / 2.0 or (cover is not None and cover > cfg["overstock_cover_days"] / 2.0)):
        return "Slow Moving"
    return "Fast Moving" if is_fast else "Healthy"


def build_reasons(p_qty, p_reorder, cost, m, extra, factors, cfg, vscale, forecast_info):
    w = cfg["weights"]
    items = []
    contrib = lambda k: (w.get(k, 0) * (factors.get(k) or 0))
    if m.get("last_sale_days") is None and m.get("has_sales_data"):
        items.append((contrib("last_sale"), "No sale recorded in the uploaded sales history"))
    elif m.get("last_sale_days") is not None and m["last_sale_days"] >= 30:
        items.append((contrib("last_sale"), f"No sale for {m['last_sale_days']} days"))
    prev, recent = m["prev_units"], m["recent_units"]
    if prev > 0 and recent < prev * 0.8:
        items.append((contrib("demand_trend"), f"Demand declined {round((prev - recent) / prev * 100)}% (last 45 days vs the 45 before)"))
    elif prev + recent == 0 and m.get("has_sales_data"):
        items.append((contrib("demand_trend"), "No units sold in the last 90 days"))
    if m.get("stock_age") is not None and m["stock_age"] >= cfg["scales"]["stock_age"] * 0.3:
        items.append((contrib("stock_age"), f"Stock has been on hand for about {int(m['stock_age'])} days"))
    value = extra["value"]
    if value > 0:
        items.append((contrib("inventory_value"), f"{inr_short(value)} of capital held in inventory"))
    if p_qty > max(p_reorder, 1) * 3:
        items.append((contrib("quantity"), f"{p_qty} units in stock ({p_qty / max(p_reorder, 1):.1f}x the reorder level of {p_reorder})"))
    if extra["cover_days"] is not None and extra["cover_days"] > cfg["overstock_cover_days"]:
        items.append((contrib("sales_frequency"), f"At the current sales rate stock would last {int(extra['cover_days'])} days"))
    if m.get("expiry_days") is not None and m["expiry_days"] < cfg["scales"]["expiry_window"]:
        items.append((contrib("expiry"), "Already expired" if m["expiry_days"] < 0 else f"Expires in {m['expiry_days']} days"))
    if m.get("season_idx") is not None and m["season_idx"] < 0.8 and w.get("seasonality", 0) > 0:
        items.append((contrib("seasonality"), f"Seasonal demand for the coming month is {round((1 - m['season_idx']) * 100)}% below this product's average"))
    items.sort(key=lambda t: -t[0])
    return [t for _, t in items[:5]]


# ---- data loading ----------------------------------------------------------------------------------------
def resolve_as_of(ws, cfg):
    if cfg.get("as_of") == "latest_data":
        s = db.session.query(func.max(Sale.sale_date)).filter(Sale.workspace_id == ws.id).scalar()
        p = db.session.query(func.max(Purchase.purchase_date)).filter(Purchase.workspace_id == ws.id).scalar()
        latest = max([d for d in (s, p) if d], default=None)
        if latest:
            return latest
    return dt.date.today()


def latest_data_date(ws_id):
    s = db.session.query(func.max(Sale.sale_date)).filter(Sale.workspace_id == ws_id).scalar()
    p = db.session.query(func.max(Purchase.purchase_date)).filter(Purchase.workspace_id == ws_id).scalar()
    return max([d for d in (s, p) if d], default=None)


def _fifo_age(lots, qty, as_of):
    """Average age of units on hand assuming oldest stock sells first. None if lots explain < 50% of stock."""
    lots = sorted(lots)
    total = sum(q for _, q in lots)
    if qty <= 0 or total <= 0:
        return None
    to_consume, remaining = max(0, total - qty), []
    for d, q in lots:
        if to_consume >= q:
            to_consume -= q
            continue
        remaining.append((d, q - to_consume))
        to_consume = 0
    have = sum(q for _, q in remaining)
    if have < 0.5 * qty:
        return None
    return sum(max(0, (as_of - d).days) * q for d, q in remaining) / have


def load_context(ws, product_ids=None, want_series=True):
    cfg = get_config(ws)
    as_of = resolve_as_of(ws, cfg)
    pq = Product.query.filter(Product.workspace_id == ws.id)
    if product_ids is not None:
        pq = pq.filter(Product.id.in_(list(product_ids)))
    products = pq.all()
    ids = {p.id for p in products}
    sq = db.session.query(Sale.product_id, Sale.sale_date, Sale.quantity).filter(Sale.workspace_id == ws.id, Sale.sale_date <= as_of)
    pu = db.session.query(Purchase.product_id, Purchase.purchase_date, Purchase.quantity).filter(Purchase.workspace_id == ws.id, Purchase.purchase_date <= as_of)
    tx = db.session.query(InventoryTransaction.product_id, InventoryTransaction.date, InventoryTransaction.quantity).filter(
        InventoryTransaction.workspace_id == ws.id, InventoryTransaction.transaction_type.in_(INFLOW_TX), InventoryTransaction.date <= as_of)
    if product_ids is not None:
        sq, pu, tx = (q.filter(c.in_(ids)) for q, c in ((sq, Sale.product_id), (pu, Purchase.product_id), (tx, InventoryTransaction.product_id)))
    sales, lots = defaultdict(list), defaultdict(list)
    for pid, d, q in sq:
        sales[pid].append((d, q))
    for pid, d, q in pu:
        lots[pid].append((d, q))
    for pid, d, q in tx:
        lots[pid].append((d, q))
    has_sales = db.session.query(Sale.id).filter(Sale.workspace_id == ws.id).first() is not None
    metrics = {}
    for p in products:
        s, l = sales.get(p.id, []), lots.get(p.id, [])
        known = [d for d, _ in s] + [d for d, _ in l]
        first = min(known) if known else None
        history_days = (as_of - first).days + 1 if first else 0
        units_90 = orders_90 = recent = prev = 0
        weekly = defaultdict(int)
        monthly = defaultdict(int)
        last = None
        for d, q in s:
            age = (as_of - d).days
            if last is None or d > last:
                last = d
            if age <= 90:
                units_90 += q
                orders_90 += 1
                if age <= 45:
                    recent += q
                else:
                    prev += q
            if age < 7 * 26:
                weekly[age // 7] += q
            monthly[(d.year, d.month)] += q
        season_idx = None
        if cfg["weights"].get("seasonality", 0) > 0 and history_days >= 365 and monthly:
            tm = (as_of + dt.timedelta(days=30)).month
            same = [v for (y, mo), v in monthly.items() if mo == tm]
            avg_all = sum(monthly.values()) / max(1, len(monthly))
            if same and len(monthly) >= 12 and avg_all > 0:
                season_idx = (sum(same) / len(same)) / avg_all
        n_weeks = min(26, (as_of - first).days // 7 + 1) if first else 0
        series = [weekly.get(i, 0) for i in range(n_weeks - 1, -1, -1)] if want_series else []
        metrics[p.id] = {
            "stock_age": _fifo_age(l, p.quantity, as_of), "last_sale_days": (as_of - last).days if last else None,
            "units_90": units_90, "orders_90": orders_90, "recent_units": recent, "prev_units": prev,
            "window_days": max(14, min(90, history_days)) if history_days else 90, "history_days": history_days,
            "has_sales_data": has_sales, "season_idx": season_idx, "series": series,
            "expiry_days": (p.expiry_date - as_of).days if p.expiry_date else None}
    return {"cfg": cfg, "as_of": as_of, "products": products, "metrics": metrics}


def value_scale(cfg, products):
    if cfg.get("value_scale"):
        return float(cfg["value_scale"])
    vals = sorted(p.quantity * p.cost_price for p in products if p.quantity > 0 and p.cost_price > 0)
    return max(1.0, vals[int(0.95 * (len(vals) - 1))]) if vals else 1.0


def product_forecast(m, horizon):
    res = fc.forecast_weekly(m["series"], horizon) if m["series"] else None
    return res or fc.fallback(m["units_90"], m["window_days"], horizon)


# ---- the analysis run ------------------------------------------------------------------------------------
def run_analysis(ws, commit=True):
    ctx = load_context(ws)
    cfg, as_of, products, metrics = ctx["cfg"], ctx["as_of"], ctx["products"], ctx["metrics"]
    horizon, lead = int(cfg["forecast_days"]), int(cfg["stockout_cover_days"])
    vscale = value_scale(cfg, products)
    prev_rows = {r.product_id: (r.risk_level, r.blocked_capital, r.stockout_risk, r.demand_trend, r.units_90d)
                 for r in RiskAnalysis.query.filter_by(workspace_id=ws.id)}
    names = {p.id: p.name for p in products}
    velocities = sorted((metrics[p.id]["units_90"] / metrics[p.id]["window_days"]) for p in products if metrics[p.id]["units_90"] > 0)
    fast_cut = velocities[int(0.8 * (len(velocities) - 1))] if len(velocities) >= 5 else None
    rows = []
    for p in products:
        m = metrics[p.id]
        score, factors, extra = score_components(p.quantity, p.cost_price, p.reorder_level, m, cfg, vscale)
        f = product_forecast(m, horizon)
        daily = f["units"] / horizon if horizon else 0.0
        fdays = (p.quantity / daily) if daily > 0 else None
        shortfall = max(0.0, f["units"] - p.quantity)
        if daily <= 0:
            stockout = None
        elif f["units"] > p.quantity or (fdays is not None and fdays < lead):
            stockout = "HIGH"
        elif fdays is not None and fdays < lead * 2:
            stockout = "MEDIUM"
        else:
            stockout = "LOW"
        is_fast = fast_cut is not None and extra["velocity"] >= fast_cut and (extra["cover_days"] or 0) < 60
        status = classify(p.quantity, m, extra, cfg, is_fast, stockout)
        value = round(p.quantity * p.cost_price, 2)
        blocked = value if score > cfg["blocked_threshold"] else 0.0
        reasons = build_reasons(p.quantity, p.reorder_level, p.cost_price, m, extra, factors, cfg, vscale, f)
        complete = [k for k, v in factors.items() if v is not None and cfg["weights"].get(k, 0) > 0]
        missing = [FACTOR_LABELS[k] for k, v in factors.items() if v is None and cfg["weights"].get(k, 0) > 0]
        rows.append(dict(
            workspace_id=ws.id, product_id=p.id, stock_age=m["stock_age"], last_sale_days=m["last_sale_days"],
            sales_frequency=round(m["orders_90"] / (m["window_days"] / 30.0), 2), inventory_value=value,
            dsrs_score=score, risk_level=risk_level_for(score), stock_status=status, blocked_capital=blocked,
            demand_trend=round(extra["trend"], 3), avg_daily_demand=round(daily, 4), cover_days=fdays if fdays is not None else extra["cover_days"],
            units_90d=m["units_90"], forecast_units=round(f["units"], 2), forecast_method=f["method"],
            forecast_wape=f["wape"], forecast_excess=round(max(0.0, p.quantity - f["units"]), 2),
            forecast_shortfall=round(shortfall, 2), stockout_risk=stockout, computed_at=utcnow(),
            details={"factors": [{"key": k, "label": FACTOR_LABELS[k], "weight": cfg["weights"][k], "risk": None if v is None else round(v, 3)}
                                 for k, v in factors.items() if cfg["weights"].get(k, 0) > 0],
                     "reasons": reasons, "missing_factors": missing,
                     "metrics": {k: v for k, v in m.items() if k != "series"}, "forecast_low": f["low"], "forecast_high": f["high"]}))
    db.session.execute(delete(RiskAnalysis).where(RiskAnalysis.workspace_id == ws.id))
    if rows:
        db.session.bulk_insert_mappings(RiskAnalysis, rows)
    ws.last_analysis_at = utcnow()
    ws.analyzed_version = ws.data_version
    ws.risk_config = {**(ws.risk_config or {}), "_runtime": {"value_scale": vscale, "as_of": as_of.isoformat()}}
    summary = _alerts(ws, rows, prev_rows, names)
    if commit:
        db.session.commit()
    return summary


def _alerts(ws, rows, prev, names):
    new_high, stockouts, declining = [], [], 0
    total_blocked = sum(r["blocked_capital"] for r in rows)
    prev_blocked = sum(v[1] for v in prev.values()) if prev else None
    for r in rows:
        old = prev.get(r["product_id"])
        if r["risk_level"] in ("HIGH", "CRITICAL") and (not old or old[0] not in ("HIGH", "CRITICAL")):
            new_high.append(r)
        if r["stockout_risk"] == "HIGH" and (not old or old[2] != "HIGH"):
            stockouts.append(r)
        if r["demand_trend"] < -0.5 and r["units_90d"] >= 10 and not (old and old[3] < -0.5):
            declining += 1
    if prev:
        if new_high:
            top = ", ".join(names[r["product_id"]] for r in sorted(new_high, key=lambda r: -r["blocked_capital"])[:3])
            notify(ws.id, "risk", f"{len(new_high)} product{'s' if len(new_high) != 1 else ''} became high risk",
                   f"Newly HIGH/CRITICAL: {top}{'...' if len(new_high) > 3 else ''}.", "critical", "/risk-analysis")
        if prev_blocked and total_blocked > prev_blocked * 1.1 and total_blocked - prev_blocked > 0:
            notify(ws.id, "capital", "Blocked capital increased",
                   f"Blocked capital rose from {inr_short(prev_blocked)} to {inr_short(total_blocked)}.", "warning", "/executive")
        if stockouts:
            notify(ws.id, "stockout", f"Stockout predicted for {len(stockouts)} product{'s' if len(stockouts) != 1 else ''}",
                   "Forecast demand exceeds available stock within the forecast window.", "warning", "/forecasting")
        if declining:
            notify(ws.id, "demand", f"Demand declining on {declining} product{'s' if declining != 1 else ''}",
                   "Sales over the last 45 days are less than half of the previous 45 days.", "warning", "/risk-analysis")
    else:
        notify(ws.id, "analysis", "First analysis completed",
               f"{len(rows)} products analysed; {inr_short(total_blocked)} of capital is blocked; "
               f"{sum(1 for r in rows if r['risk_level'] in ('HIGH', 'CRITICAL'))} products are high risk.", "success", "/dashboard")
    return {"products": len(rows), "blocked_capital": round(total_blocked, 2), "new_high_risk": len(new_high),
            "stockout_predicted": len(stockouts)}


def maybe_auto_refresh(ws, limit=1500):
    """Keep results current after small edits; large workspaces use the explicit Refresh button."""
    if Product.query.filter_by(workspace_id=ws.id).count() <= limit:
        run_analysis(ws, commit=False)
