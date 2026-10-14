"""What-if simulator: projections, not predictions.

Assumptions (all shown to the user and adjustable where noted):
  * Organic demand = forecast average daily demand x (1 + demand change %) x horizon (capped at stock).
  * A discount d% lifts sell-through of the remaining stock by  min(95%, price_sensitivity x d%)  - the original
    StockGhost clearance model (sensitivity default 2.8: 25% off -> ~70% of remaining stock sells), scaled by
    min(1, horizon/30 days).  Price sensitivity is user-adjustable because it differs by product.
  * Discounted units are sold at the discounted price. Revenue/recovery numbers are estimates.
"""
import math

from services.dsrs import get_config, risk_level_for, score_components, value_scale

SENSITIVITY = 2.8
MAX_SELL_THROUGH = 0.95


def _vscale(ws, cfg, rows):
    rt = (ws.risk_config or {}).get("_runtime", {})
    if rt.get("value_scale"):
        return float(rt["value_scale"])
    vals = sorted(r.inventory_value for r in rows if r.inventory_value and r.inventory_value > 0)
    return max(1.0, vals[int(0.95 * (len(vals) - 1))]) if vals else 1.0


def _run(p, r, cfg, vscale, discount, demand_change=0.0, purchase_qty=0, horizon=30, sens=SENSITIVITY):
    m = dict((r.details or {}).get("metrics", {}))
    d = max(0.0, min(90.0, float(discount)))
    stock = p.quantity + max(0, int(purchase_qty))
    daily = (r.avg_daily_demand or 0.0) * (1 + float(demand_change) / 100.0)
    organic = min(stock, daily * horizon)
    reach = min(1.0, horizon / 30.0)
    uplift = (stock - organic) * min(MAX_SELL_THROUGH, sens * d / 100.0) * reach
    units = int(round(min(stock, organic + uplift)))
    price = round(p.selling_price * (1 - d / 100.0), 2)
    revenue = round(units * price, 2)
    recovered = round(units * p.cost_price, 2)
    remaining = stock - units
    sell_through = units / stock if stock else 0.0
    after = dict(m)
    if m:
        after["stock_age"] = None if m.get("stock_age") is None else m["stock_age"] * (1 - sell_through * 0.5)
        # The projection changes the STOCK POSITION only (quantity, value, age). Historical demand signals - days since
        # last sale, 90-day units, demand trend - are held fixed: a 30-day scenario does not rewrite a product's history,
        # and units moved by a one-off discount are not evidence that demand has recovered.
        score, _, _ = score_components(remaining, p.cost_price, p.reorder_level, after, cfg, vscale)
    else:
        score = r.dsrs_score
    value_left = round(remaining * p.cost_price, 2)
    return {"discount_pct": d, "discounted_price": price, "estimated_units_sold": units,
            "sell_through_pct": round(sell_through * 100, 1), "revenue": revenue, "capital_recovered": recovered,
            "profit_or_loss": round(revenue - recovered, 2), "remaining_stock": remaining, "remaining_value": value_left,
            "updated_dsrs": score, "updated_risk_level": risk_level_for(score),
            "remaining_blocked_capital": value_left if score > cfg["blocked_threshold"] else 0.0,
            "below_cost": price < p.cost_price, "organic_units": int(round(organic))}


def simulate_product(ws, p, r, discount, demand_change=0.0, purchase_qty=0, horizon=30, sens=SENSITIVITY):
    cfg = get_config(ws)
    vs = _vscale(ws, cfg, [r])
    res = _run(p, r, cfg, vs, discount, demand_change, purchase_qty, horizon, sens)
    res["curve"] = [{k: x[k] for k in ("discount_pct", "capital_recovered", "revenue", "updated_dsrs", "estimated_units_sold", "remaining_blocked_capital")}
                    for x in (_run(p, r, cfg, vs, dd, demand_change, purchase_qty, horizon, sens) for dd in range(0, 75, 5))]
    res["product"] = p.to_dict()
    res["before"] = {"dsrs_score": r.dsrs_score, "risk_level": r.risk_level, "blocked_capital": r.blocked_capital,
                     "stock": p.quantity, "inventory_value": round(p.quantity * p.cost_price, 2)}
    res["after"] = {"dsrs_score": res["updated_dsrs"], "risk_level": res["updated_risk_level"],
                    "blocked_capital": res["remaining_blocked_capital"], "stock": res["remaining_stock"],
                    "inventory_value": res["remaining_value"]}
    res["assumptions"] = assumptions(sens, horizon, demand_change)
    return res


def simulate_portfolio(ws, pairs, discount, demand_change=0.0, horizon=30, sens=SENSITIVITY, steps=(0, 10, 20, 30, 40, 50)):
    """pairs: [(Product, RiskAnalysis)] chosen by the caller (all inside the workspace)."""
    cfg = get_config(ws)
    vs = _vscale(ws, cfg, [r for _, r in pairs])

    def total(dd):
        agg = dict(units=0, revenue=0.0, recovered=0.0, remaining_value=0.0, blocked=0.0, score_sum=0, remaining_units=0)
        for p, r in pairs:
            x = _run(p, r, cfg, vs, dd, demand_change, 0, horizon, sens)
            agg["units"] += x["estimated_units_sold"]
            agg["revenue"] += x["revenue"]
            agg["recovered"] += x["capital_recovered"]
            agg["remaining_value"] += x["remaining_value"]
            agg["blocked"] += x["remaining_blocked_capital"]
            agg["score_sum"] += x["updated_dsrs"]
            agg["remaining_units"] += x["remaining_stock"]
        return agg

    cur_blocked = sum(r.blocked_capital for _, r in pairs)
    cur_value = sum(p.quantity * p.cost_price for p, _ in pairs)
    cur_units = sum(p.quantity for p, _ in pairs)
    n = max(1, len(pairs))
    sel = total(discount)
    return {
        "products": len(pairs), "discount_pct": discount, "horizon_days": horizon,
        "current": {"blocked_capital": round(cur_blocked, 2), "inventory_value": round(cur_value, 2), "units": cur_units,
                    "avg_dsrs": round(sum(r.dsrs_score for _, r in pairs) / n, 1)},
        "projected": {"blocked_capital": round(sel["blocked"], 2), "inventory_value": round(sel["remaining_value"], 2),
                      "units": sel["remaining_units"], "units_sold": sel["units"], "sales": round(sel["revenue"], 2),
                      "capital_recovered": round(sel["recovered"], 2), "profit_or_loss": round(sel["revenue"] - sel["recovered"], 2),
                      "avg_dsrs": round(sel["score_sum"] / n, 1)},
        "curve": [{"discount_pct": s, "blocked_capital": round((t := total(s))["blocked"], 2), "sales": round(t["revenue"], 2),
                   "capital_recovered": round(t["recovered"], 2), "units_sold": t["units"]} for s in steps],
        "assumptions": assumptions(sens, horizon, demand_change),
    }


def assumptions(sens, horizon, demand_change):
    return [f"Projection over {horizon} days; organic demand follows the statistical forecast"
            f"{' adjusted by ' + format(demand_change, '+g') + '%' if demand_change else ''}.",
            f"A discount of d% lifts sell-through of remaining stock by {sens} x d% (max 95%). This is an assumption, not a measured elasticity.",
            "Discounted units are priced at the discounted selling price; revenue and recovery are estimates, not guarantees."]
