"""StockGhost Business Copilot - a RULE-BASED assistant (intent matching + SQL), not a language model.
It only reads the caller's workspace and every number in an answer is computed from that data."""
import re

from sqlalchemy import func
from sqlalchemy.orm import joinedload

from extensions import db
from models import Product, Purchase, RiskAnalysis, Sale, Supplier
from services.dsrs import LEVEL_LABELS
from services.simulator import simulate_portfolio
from utils import inr

SUGGESTIONS = ["Which products are tying up the most money?", "Show me the top 10 dead-stock products.",
               "Which products may stock out next month?", "What categories have the most blocked capital?",
               "What happens if I discount the top 5 dead-stock products by 20%?", "Give me an inventory summary."]
RISK_COLS = ["Product", "SKU", "DSRS", "Risk", "Status", "Blocked capital"]
STOP = {"the", "a", "an", "of", "for", "and", "pro", "set", "pack", "1m", "in"}
SOURCE = "Calculated from your workspace data. Rule-based assistant - not a language model."


def _r(intent, answer, columns=None, rows=None, link=None):
    return {"intent": intent, "answer": answer, "columns": columns or [], "rows": rows or [], "suggestions": SUGGESTIONS[:4],
            "source": SOURCE, "link": link}


def _has(q, *w):
    return any(x in q for x in w)


def _base(ws_id):
    return (RiskAnalysis.query.filter(RiskAnalysis.workspace_id == ws_id).join(Product, Product.id == RiskAnalysis.product_id)
            .options(joinedload(RiskAnalysis.product)))


def _rows(rs):
    return [[r.product.name, r.product.sku, r.dsrs_score, LEVEL_LABELS[r.risk_level], r.stock_status, inr(r.blocked_capital)] for r in rs]


def _top_n(q, default=10):
    m = re.search(r"\btop\s+(\d{1,3})\b", q) or re.search(r"\b(\d{1,3})\s+(?:products|items|skus)\b", q)
    return max(1, min(50, int(m.group(1)))) if m else default


def _find_product(ws_id, q):
    best, score = None, 0
    for p in Product.query.filter_by(workspace_id=ws_id).all():
        if p.sku.lower() in q:
            return p
        nm = p.name.lower()
        if nm in q and len(nm) > score:
            best, score = p, len(nm)
    if best:
        return best
    for p in Product.query.filter_by(workspace_id=ws_id).all():
        toks = [t for t in re.findall(r"[a-z0-9]+", p.name.lower()) if t not in STOP and len(t) > 2]
        if toks and all(t in q for t in toks) and len(" ".join(toks)) > score:
            best, score = p, len(" ".join(toks))
    return best


def answer(ws, message):
    q = re.sub(r"\s+", " ", (message or "").lower()).strip()
    wid = ws.id
    if not q:
        return _r("empty", "Ask me about dead stock, blocked capital, forecasts or a specific product.")
    if Product.query.filter_by(workspace_id=wid).count() == 0:
        return _r("no_data", "No business data has been uploaded yet, so there is nothing to analyse. Upload your data to get started.", link="/data-import")
    if RiskAnalysis.query.filter_by(workspace_id=wid).count() == 0:
        return _r("no_analysis", "Your data is imported but the analysis has not been run yet. Use 'Refresh analysis' on the dashboard.", link="/dashboard")
    if re.match(r"^(hi|hello|hey|help)\b", q):
        return _r("help", "Hi! I answer questions about your inventory using only your workspace's data. Try one of the suggestions.")

    # what-if on the top N dead-stock products
    m = re.search(r"(\d{1,2})\s*%", q)
    if _has(q, "what if", "what happens", "simulate") and m and _has(q, "discount", "markdown", "clearance"):
        n, disc = _top_n(q, 5), float(m.group(1))
        rs = _base(wid).filter(RiskAnalysis.stock_status == "Dead Stock").order_by(RiskAnalysis.inventory_value.desc()).limit(n).all()
        if not rs:
            rs = _base(wid).filter(RiskAnalysis.blocked_capital > 0).order_by(RiskAnalysis.blocked_capital.desc()).limit(n).all()
        if not rs:
            return _r("whatif", "There are no dead-stock or blocked products to simulate right now.")
        sim = simulate_portfolio(ws, [(r.product, r) for r in rs], disc, steps=(0, disc))
        c, p = sim["current"], sim["projected"]
        return _r("whatif", f"PROJECTION (estimate, 30 days): discounting the top {len(rs)} dead-stock products by {disc:.0f}% would take blocked capital "
                  f"from {inr(c['blocked_capital'])} to {inr(p['blocked_capital'])}, sell about {p['units_sold']} units and recover roughly {inr(p['capital_recovered'])} "
                  f"of cost ({inr(p['sales'])} sales). This relies on the simulator's price-sensitivity assumption; use the Simulator page to adjust it.",
                  RISK_COLS, _rows(rs), "/simulator")

    p = _find_product(wid, q)
    if p:
        r = RiskAnalysis.query.filter_by(workspace_id=wid, product_id=p.id).first()
        if r:
            why = "; ".join(r.details.get("reasons", [])) if r.details else ""
            fc = (f" Forecast demand over the next 30 days: about {round(r.forecast_units)} units "
                  f"({'statistical forecast' if r.forecast_method != 'average_velocity' else 'average-velocity estimate, limited history'}); "
                  f"{'expected shortfall ' + str(round(r.forecast_shortfall)) + ' units.' if r.forecast_shortfall > 0 else 'expected excess ' + str(round(r.forecast_excess)) + ' units.'}")
            return _r("product", f"{p.name} ({p.sku}) has a DSRS of {r.dsrs_score}/100 - {LEVEL_LABELS[r.risk_level]} risk, status {r.stock_status}. "
                      f"It holds {p.quantity} units worth {inr(r.inventory_value)}; blocked capital {inr(r.blocked_capital)}."
                      + (f" Why: {why}." if why else " No major risk drivers were found.") + fc, link="/risk-analysis")

    if _has(q, "stock out", "stockout", "run out", "running out", "may stock", "shortage"):
        rs = _base(wid).filter(RiskAnalysis.stockout_risk == "HIGH").order_by(RiskAnalysis.forecast_shortfall.desc()).limit(10).all()
        n = RiskAnalysis.query.filter_by(workspace_id=wid, stockout_risk="HIGH").count()
        return _r("stockout", f"{n} products have forecast demand that exceeds stock (or less than the lead-time buffer of cover).",
                  ["Product", "SKU", "In stock", "Forecast 30d", "Shortfall"],
                  [[r.product.name, r.product.sku, r.product.quantity, round(r.forecast_units), round(r.forecast_shortfall)] for r in rs], "/forecasting")
    if _has(q, "overstock", "excess", "too much stock"):
        rs = _base(wid).filter(RiskAnalysis.forecast_excess > 0).order_by(RiskAnalysis.forecast_excess.desc()).limit(10).all()
        return _r("overstock", f"{RiskAnalysis.query.filter_by(workspace_id=wid, stock_status='Overstock').count()} products are classed as overstock. Largest forecast excess:",
                  ["Product", "SKU", "In stock", "Forecast 30d", "Excess"],
                  [[r.product.name, r.product.sku, r.product.quantity, round(r.forecast_units), round(r.forecast_excess)] for r in rs], "/forecasting")
    if "categor" in q:
        rows = (db.session.query(Product.category, func.sum(RiskAnalysis.blocked_capital), func.sum(RiskAnalysis.inventory_value))
                .join(RiskAnalysis, RiskAnalysis.product_id == Product.id).filter(Product.workspace_id == wid).group_by(Product.category)
                .order_by(func.sum(RiskAnalysis.blocked_capital).desc()).all())
        if rows and (rows[0][1] or 0) > 0:
            return _r("category", f"{rows[0][0]} has the most blocked capital: {inr(rows[0][1])}.", ["Category", "Blocked capital", "Inventory value"],
                      [[c, inr(b), inr(v)] for c, b, v in rows[:10]], "/executive")
        return _r("category", "No capital is currently blocked in any category.")
    if _has(q, "supplier", "vendor"):
        rows = (db.session.query(Supplier.name, func.sum(RiskAnalysis.blocked_capital), func.count())
                .join(Product, Product.supplier_id == Supplier.id).join(RiskAnalysis, RiskAnalysis.product_id == Product.id)
                .filter(Supplier.workspace_id == wid).group_by(Supplier.name).order_by(func.sum(RiskAnalysis.blocked_capital).desc()).limit(10).all())
        if rows:
            return _r("supplier", f"Stock from {rows[0][0]} has the most blocked capital: {inr(rows[0][1])}.", ["Supplier", "Blocked capital", "Products"],
                      [[n, inr(b), c] for n, b, c in rows], "/suppliers")
        return _r("supplier", "Your products are not linked to suppliers yet, so I cannot break blocked capital down by supplier.")
    if _has(q, "total") and _has(q, "blocked", "capital"):
        tot = db.session.query(func.coalesce(func.sum(RiskAnalysis.blocked_capital), 0), func.coalesce(func.sum(RiskAnalysis.inventory_value), 0)).filter(RiskAnalysis.workspace_id == wid).one()
        return _r("total_blocked", f"Total blocked capital is {inr(tot[0])} - {round(tot[0] / tot[1] * 100, 1) if tot[1] else 0}% of your {inr(tot[1])} inventory value.", link="/executive")
    if _has(q, "tying up", "tie up", "most money", "most capital", "blocks the most", "block the most", "stuck", "highest blocked", "biggest blocked") or (_has(q, "which product") and _has(q, "block", "money", "capital")):
        n = _top_n(q, 5)
        rs = _base(wid).order_by(RiskAnalysis.blocked_capital.desc(), RiskAnalysis.inventory_value.desc()).limit(n).all()
        t = rs[0]
        if t.blocked_capital <= 0:
            rs = _base(wid).order_by(RiskAnalysis.inventory_value.desc()).limit(n).all()
            return _r("top_money", f"No capital is blocked right now. The largest inventory holding is {rs[0].product.name} at {inr(rs[0].inventory_value)}.", RISK_COLS, _rows(rs))
        return _r("top_money", f"{t.product.name} blocks the most capital: {inr(t.blocked_capital)} across {t.product.quantity} units (DSRS {t.dsrs_score}). Top {len(rs)}:", RISK_COLS, _rows(rs), "/dead-stock")
    if _has(q, "dead"):
        n = _top_n(q, 10)
        rs = _base(wid).filter(RiskAnalysis.stock_status == "Dead Stock").order_by(RiskAnalysis.inventory_value.desc()).limit(n).all()
        tot = db.session.query(func.count(), func.coalesce(func.sum(RiskAnalysis.inventory_value), 0)).filter(RiskAnalysis.workspace_id == wid, RiskAnalysis.stock_status == "Dead Stock").one()
        return _r("dead_stock", f"{tot[0]} products are dead stock, holding {inr(tot[1])}. Showing the largest {len(rs)}.", RISK_COLS, _rows(rs), "/dead-stock")
    if _has(q, "discount", "clearance", "markdown", "promot"):
        rs = _base(wid).filter(RiskAnalysis.dsrs_score > 60).order_by(RiskAnalysis.dsrs_score.desc(), RiskAnalysis.blocked_capital.desc()).limit(10).all()
        n = RiskAnalysis.query.filter(RiskAnalysis.workspace_id == wid, RiskAnalysis.dsrs_score > 60).count()
        return _r("discounts", f"{n} products score above 60 and are candidates for a discount (above 80: clearance; 61-80: promotion).", RISK_COLS, _rows(rs), "/recommendations")
    if _has(q, "high risk", "high-risk", "risky", "at risk", "critical"):
        rs = _base(wid).filter(RiskAnalysis.risk_level.in_(("HIGH", "CRITICAL"))).order_by(RiskAnalysis.dsrs_score.desc()).limit(10).all()
        n = RiskAnalysis.query.filter(RiskAnalysis.workspace_id == wid, RiskAnalysis.risk_level.in_(("HIGH", "CRITICAL"))).count()
        return _r("high_risk", f"{n} products are high or critical risk (DSRS above 60).", RISK_COLS, _rows(rs), "/risk-analysis")
    if "slow" in q:
        rs = _base(wid).filter(RiskAnalysis.stock_status == "Slow Moving").order_by(RiskAnalysis.dsrs_score.desc()).limit(10).all()
        return _r("slow", f"{RiskAnalysis.query.filter_by(workspace_id=wid, stock_status='Slow Moving').count()} products are slow moving.", RISK_COLS, _rows(rs))
    if _has(q, "reorder", "low stock", "below reorder", "restock"):
        ps = Product.query.filter(Product.workspace_id == wid, Product.quantity <= Product.reorder_level).order_by(Product.quantity).limit(10).all()
        n = Product.query.filter(Product.workspace_id == wid, Product.quantity <= Product.reorder_level).count()
        return _r("reorder", f"{n} products are at or below their reorder level.", ["Product", "SKU", "In stock", "Reorder level"], [[p.name, p.sku, p.quantity, p.reorder_level] for p in ps])
    if _has(q, "best sell", "top sell", "fast moving", "fastest", "bestsell"):
        rs = _base(wid).order_by(RiskAnalysis.units_90d.desc()).limit(10).all()
        return _r("top_sellers", "Top sellers by units sold in the last 90 days:", ["Product", "SKU", "Units (90d)", "Status"],
                  [[r.product.name, r.product.sku, r.units_90d, r.stock_status] for r in rs])
    if _has(q, "revenue", "sales total", "how much did we sell"):
        tot = db.session.query(func.coalesce(func.sum(Sale.quantity * func.coalesce(Sale.unit_price, 0)), 0), func.coalesce(func.sum(Sale.quantity), 0)).filter(Sale.workspace_id == wid).one()
        return _r("revenue", f"Across all uploaded sales: {inr(tot[0])} revenue from {int(tot[1])} units. Use the dashboard date filters for a specific period.", link="/dashboard")
    if _has(q, "summary", "overview", "status", "health", "how is"):
        c = dict(db.session.query(RiskAnalysis.stock_status, func.count()).filter(RiskAnalysis.workspace_id == wid).group_by(RiskAnalysis.stock_status).all())
        tot = db.session.query(func.coalesce(func.sum(RiskAnalysis.blocked_capital), 0), func.coalesce(func.sum(RiskAnalysis.inventory_value), 0)).filter(RiskAnalysis.workspace_id == wid).one()
        return _r("summary", f"Inventory is worth {inr(tot[1])}; {inr(tot[0])} of it is blocked. " + ", ".join(f"{k}: {v}" for k, v in sorted(c.items())) + ".", link="/dashboard")
    return _r("fallback", "I didn't catch that. I can answer questions about blocked capital, dead stock, stock-out forecasts, discounts, suppliers, categories "
              "or a specific product name or SKU. I won't guess at numbers I can't calculate from your data.")
