"""Statistical demand forecasting (NOT machine learning).

Method selection per product, on weekly unit sales:
  * moving average (4 weeks)
  * simple exponential smoothing  (alpha grid)
  * damped-trend Holt linear smoothing (alpha/beta grid)
The method with the lowest WAPE on a hold-out of the most recent weeks wins. The hold-out is never used
to fit the models that are scored on it (train = weeks before the hold-out), so there is no leakage; the
winner is then re-fitted on all history. With too little history the engine falls back to a plain
average daily velocity and says so (`method = "average_velocity"`, no accuracy reported).
"""
import math

MIN_WEEKS = 8            # weeks of history required for statistical forecasting
MIN_ACTIVE_WEEKS = 3     # weeks with at least one sale
PHI = 0.85               # trend damping

METHOD_LABELS = {"moving_average": "Moving average (4 wk)", "exp_smoothing": "Exponential smoothing",
                 "holt_damped": "Holt linear trend (damped)", "average_velocity": "Average velocity (limited data)"}


def _ma(y, h, k=4):
    base = sum(y[-k:]) / min(k, len(y))
    return [base] * h, None


def _ses(y, h, alpha):
    lvl = y[0]
    for v in y[1:]:
        lvl = alpha * v + (1 - alpha) * lvl
    return [lvl] * h


def _holt(y, h, alpha, beta):
    lvl, tr = y[0], (y[1] - y[0]) if len(y) > 1 else 0.0
    for v in y[1:]:
        prev = lvl
        lvl = alpha * v + (1 - alpha) * (prev + PHI * tr)
        tr = beta * (lvl - prev) + (1 - beta) * PHI * tr
    out, damp = [], 0.0
    for i in range(1, h + 1):
        damp += PHI ** i
        out.append(lvl + damp * tr)
    return out


def _predict(y, h, spec):
    kind, a, b = spec
    if kind == "moving_average":
        return _ma(y, h)[0]
    f = _ses(y, h, a) if kind == "exp_smoothing" else _holt(y, h, a, b)
    return [max(0.0, v) for v in f]


def _wape(actual, fc):
    tot = sum(actual)
    if tot <= 0:
        return None
    return sum(abs(a - f) for a, f in zip(actual, fc)) / tot


CANDIDATES = ([("moving_average", None, None)] + [("exp_smoothing", a, None) for a in (0.2, 0.4, 0.6)]
              + [("holt_damped", a, b) for a in (0.2, 0.4, 0.6) for b in (0.1, 0.3)])


def forecast_weekly(y, horizon_days):
    """y: weekly units, oldest first. Returns dict or None when history is insufficient."""
    n = len(y)
    if n < MIN_WEEKS or sum(1 for v in y if v > 0) < MIN_ACTIVE_WEEKS:
        return None
    hold = max(2, min(4, n // 4))
    train, test = y[:-hold], y[-hold:]
    best, best_w = None, None
    for spec in CANDIDATES:
        w = _wape(test, _predict(train, hold, spec))
        if w is not None and (best_w is None or w < best_w):
            best, best_w = spec, w
    if best is None:
        return None
    weeks = max(1, math.ceil(horizon_days / 7))
    fc = _predict(y, weeks, best)
    # residual spread from one-step-ahead in-sample errors of the chosen method
    errs = []
    for i in range(max(4, n // 2), n):
        errs.append(y[i] - _predict(y[:i], 1, best)[0])
    sigma = math.sqrt(sum(e * e for e in errs) / len(errs)) if errs else 0.0
    per_day = [v / 7.0 for v in fc]
    total = 0.0
    for d in range(horizon_days):
        total += per_day[min(d // 7, weeks - 1)]
    spread = 1.28 * sigma * math.sqrt(weeks) * (horizon_days / (weeks * 7.0))
    return {"method": best[0], "units": total, "low": max(0.0, total - spread), "high": total + spread,
            "wape": round(best_w, 3), "weekly_forecast": [round(v, 2) for v in fc], "holdout_weeks": hold}


def fallback(units_90, history_days, horizon_days):
    """Average daily velocity over the observed window (max 90 days)."""
    window = max(1, min(90, history_days))
    daily = units_90 / window
    return {"method": "average_velocity", "units": daily * horizon_days, "low": None, "high": None,
            "wape": None, "weekly_forecast": [], "holdout_weeks": 0}
