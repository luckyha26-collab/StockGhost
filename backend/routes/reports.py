import re

from flask import Blueprint, Response, g, request

from extensions import db
from services import reports as R
from utils import ApiError, audit, notify, ok, parse_date, require

bp = Blueprint("reports", __name__, url_prefix="/api/reports")


@bp.get("")
@require("reports.view")
def catalog():
    return ok([{"kind": k, "title": t, "uses_period": k in ("sales", "purchases")} for k, t in R.TITLES.items()])


@bp.get("/<kind>")
@require("reports.view")
def report(kind):
    if kind not in R.TITLES:
        raise ApiError("Unknown report.", 404)
    fmt = request.args.get("format", "json")
    if fmt not in R.MAX_ROWS:
        raise ApiError("Unsupported format.")
    start = parse_date(request.args.get("start"), "Start date", False)
    end = parse_date(request.args.get("end"), "End date", False)
    if not g.ws.id:
        raise ApiError("No workspace.")
    from models import Product
    if Product.query.filter_by(workspace_id=g.ws.id).count() == 0:
        raise ApiError("There is no data to report on yet. Upload your data first.")
    limit = {"json": 100, "csv": R.MAX_ROWS["csv"], "xlsx": R.MAX_ROWS["xlsx"], "pdf": 500}[fmt]
    rep = R.build(kind, g.ws, start, end, limit)
    if fmt == "json":
        return ok(rep)
    safe = re.sub(r"[^A-Za-z0-9]+", "_", g.ws.name).strip("_")[:30] or "workspace"
    name = f"{safe}_{kind}_{rep['meta']['generated_at'][:11].replace(' ', '')}"
    if fmt == "csv":
        data, mime = R.to_csv(rep), "text/csv"
    elif fmt == "xlsx":
        data, mime = R.to_xlsx(rep), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    else:
        data, mime = R.to_pdf(rep, g.ws), "application/pdf"
    audit("REPORT_GENERATED", f"{rep['meta']['title']} ({fmt.upper()})")
    if fmt in ("pdf", "xlsx"):
        notify(g.ws.id, "report", "Report ready", f"{rep['meta']['title']} ({fmt.upper()}) was generated.", "success", "/reports")
    db.session.commit()
    return Response(data, mimetype=mime, headers={"Content-Disposition": f'attachment; filename="{name}.{fmt}"', "X-Content-Type-Options": "nosniff"})
