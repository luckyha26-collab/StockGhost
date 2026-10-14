"""Rule-based, explainable recommendations. Every number is derived from the workspace's own analysis and
every financial figure is labelled as an estimate (see services/simulator.py for the model)."""
import math
from collections import defaultdict

from models import Product, RiskAnalysis
from services.dsrs import get_config
from services.simulator import _run, _vscale
from utils import inr_short

PRIORITY_ORDER = {"Critical": 0, "High": 1, "Medium": 2, "Watch": 3}


def suggested_discount(score):
    """Discount tier used by recommendations (0 = no discount)."""
    if score > 80:
        return min(60, 30 + int((score - 80) * 0.5))
    if score > 60:
        return 15 + int((score - 61) * 0.5)
    return 0


def _estimate(ws, cfg, vs, p, r, discount):
    x = _run(p, r, cfg, vs, discount)
    return {"discount_pct": discount, "units_reduction": x["estimated_units_sold"], "capital_recovery": x["capital_recovered"],
            "revenue": x["revenue"], "projected_dsrs": x["updated_dsrs"], "below_cost": x["below_cost"],
            "note": "Estimate based on the simulator's clearance model - not a guaranteed result."}


def build_for(ws, cfg, vs, p, r):
    score, status, lead = r.dsrs_score, r.stock_status, cfg["stockout_cover_days"]
    reasons = list((r.details or {}).get("reasons", []))
    base = {"product_id": p.id, "product_name": p.name, "sku": p.sku, "category": p.category, "dsrs_score": score,
            "risk_level": r.risk_level, "stock_status": status, "quantity": p.quantity,
            "inventory_value": round(r.inventory_value, 2), "blocked_capital": round(r.blocked_capital, 2),
            "supplier_name": p.supplier.name if p.supplier else None}
    if r.stockout_risk == "HIGH" and r.avg_daily_demand > 0:
        need = int(math.ceil(r.forecast_units + lead * r.avg_daily_demand - p.quantity))
        need = max(need, 1)
        why = [f"Forecast demand is {round(r.forecast_units)} units over the next {cfg['forecast_days']} days but only {p.quantity} are in stock."]
        if r.cover_days is not None:
            why.append(f"Stock covers about {r.cover_days:.0f} days at the forecast rate (lead-time buffer: {lead} days).")
        return {**base, "type": "reorder", "actions": ["Reorder"], "action": "Reorder", "tier": "reorder",
                "priority": "Critical" if p.quantity == 0 or (r.cover_days or 99) < lead / 2 else "High",
                "summary": f"Reorder about {need} units to cover the forecast plus a {lead}-day buffer.",
                "reasons": why, "suggested_discount": 0, "suggested_quantity": need,
                "estimate": {"purchase_outlay": round(need * p.cost_price, 2),
                             "note": "Estimated outlay = suggested quantity x current cost price."}}
    if p.quantity <= 0:
        return None
    if score > 80:
        disc = suggested_discount(score)
        est = _estimate(ws, cfg, vs, p, r, disc)
        return {**base, "type": "clearance", "tier": "clearance", "priority": "Critical",
                "actions": ["Clearance Sale", "Bundle Products", "Liquidation", "Reduce future purchases"],
                "action": f"{disc}% Clearance Discount", "suggested_discount": disc,
                "summary": "Dead-stock risk. Run a deep clearance, bundle with fast sellers, liquidate what remains and stop re-ordering.",
                "reasons": reasons, "estimate": est}
    if score > 60:
        disc = suggested_discount(score)
        est = _estimate(ws, cfg, vs, p, r, disc)
        return {**base, "type": "promotion", "tier": "promotion", "priority": "High", "actions": ["Promotion", "Discount"],
                "action": f"{disc}% Promotional Discount", "suggested_discount": disc,
                "summary": "High risk. Launch a targeted promotion before this stock turns into dead stock.",
                "reasons": reasons, "estimate": est}
    if status == "Overstock" or (r.forecast_excess > max(p.reorder_level * 3, 1) and score > 30):
        return {**base, "type": "reduce_purchases", "tier": "monitor", "priority": "Medium", "actions": ["Reduce future purchases"],
                "action": "Reduce future purchases", "suggested_discount": 0,
                "summary": f"Stock exceeds forecast demand by about {round(r.forecast_excess)} units. Pause or cut re-orders.",
                "reasons": reasons or [f"Stock covers {r.cover_days:.0f} days of forecast demand." if r.cover_days else "Stock is well above forecast demand."],
                "estimate": {"excess_units": round(r.forecast_excess),
                             "excess_value": round(r.forecast_excess * p.cost_price, 2),
                             "note": "Excess = stock minus forecast demand over the forecast window."}}
    if score > 30:
        return {**base, "type": "monitor", "tier": "monitor", "priority": "Watch", "actions": ["Monitor"], "action": "Monitor",
                "suggested_discount": 0, "summary": "Slow moving. No discount yet; watch sales weekly and avoid re-ordering.",
                "reasons": reasons, "estimate": None}
    return None


def all_recommendations(ws, category=None, tier=None):
    cfg = get_config(ws)
    q = (RiskAnalysis.query.filter(RiskAnalysis.workspace_id == ws.id)
         .join(Product, Product.id == RiskAnalysis.product_id))
    if category:
        q = q.filter(Product.category == category)
    pairs = [(r.product, r) for r in q.all()]
    vs = _vscale(ws, cfg, [r for _, r in pairs])
    out = [x for p, r in pairs if (x := build_for(ws, cfg, vs, p, r))]
    # supplier-level recommendation: a supplier tying up a large share of blocked capital
    total_blocked = sum(r.blocked_capital for _, r in pairs)
    by_sup = defaultdict(lambda: [0.0, 0])
    for p, r in pairs:
        if r.blocked_capital > 0 and p.supplier:
            by_sup[p.supplier.name][0] += r.blocked_capital
            by_sup[p.supplier.name][1] += 1
    if total_blocked > 0:
        for name, (amt, n) in by_sup.items():
            if amt >= 0.2 * total_blocked and n >= 2:
                out.append({"product_id": None, "product_name": f"Supplier: {name}", "sku": None, "category": None, "dsrs_score": None,
                            "risk_level": "HIGH", "stock_status": None, "quantity": None, "inventory_value": None,
                            "blocked_capital": round(amt, 2), "supplier_name": name, "type": "supplier", "tier": "supplier",
                            "priority": "High", "actions": ["Supplier negotiation"], "action": "Supplier negotiation",
                            "suggested_discount": 0,
                            "summary": f"Ask {name} about returns, price protection or smaller order sizes.",
                            "reasons": [f"{n} products from this supplier hold {inr_short(amt)} of blocked capital "
                                        f"({amt / total_blocked * 100:.0f}% of all blocked capital)."], "estimate": None})
    if tier:
        out = [x for x in out if x["tier"] == tier]
    out.sort(key=lambda x: (PRIORITY_ORDER[x["priority"]], -(x["blocked_capital"] or 0)))
    return out
