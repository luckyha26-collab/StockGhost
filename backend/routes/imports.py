"""Data Import Center: upload -> map columns -> validate/clean -> import -> analyse. All steps are workspace-scoped."""
import csv
import io
import logging
import os
import uuid

from flask import Blueprint, Response, g, request

import config
from extensions import db
from models import ImportJob, utcnow
from routes.workspace import wipe_business_data
from services import importer as I
from services.dsrs import run_analysis
from services.import_fields import DATASET_TYPES, DATASETS, dataset_schema, field_spec, suggest_mapping
from utils import ApiError, audit, body, can, fail, get_scoped, notify, ok, paginate, require, scoped, touch

bp = Blueprint("imports", __name__, url_prefix="/api/imports")
log = logging.getLogger("stockghost.import")
GENERIC = "Something went wrong while processing your dataset. No data was changed."


def _opts(d):
    d = d or {}
    return {"auto_fix": bool(d.get("auto_fix", False)), "remove_duplicates": bool(d.get("remove_duplicates", True)),
            "exclude_outliers": bool(d.get("exclude_outliers", False)),
            "date_format": d.get("date_format") if d.get("date_format") in ("auto", "dayfirst", "monthfirst") else "auto"}


def _check_mapping(dtype, mapping, headers):
    if not isinstance(mapping, dict):
        raise ApiError("Column mapping is missing.")
    clean = {}
    for f, h in mapping.items():
        if h in (None, "", "__skip__"):
            continue
        if f not in DATASETS[dtype]["fields"]:
            raise ApiError(f"Unknown field '{f}'.")
        if h not in headers:
            raise ApiError(f"Column '{h}' does not exist in the file.")
        clean[f] = h
    if len(set(clean.values())) != len(clean):
        raise ApiError("A file column can only be mapped to one StockGhost field.")
    d = DATASETS[dtype]
    miss = [field_spec(dtype, f)[0] for f in d["required"] if f not in clean]
    if miss:
        raise ApiError("Map the required fields first: " + ", ".join(miss) + ".")
    if d["one_of"] and not any(f in clean for f in d["one_of"]):
        raise ApiError("Map at least one of: " + " or ".join(field_spec(dtype, f)[0] for f in d["one_of"]) + ".")
    return clean


def _load(job):
    if not job.stored_path or not os.path.exists(job.stored_path):
        raise ApiError("The original file is no longer available. Upload it again.", 410)
    return I.read_table(job.stored_path, os.path.splitext(job.stored_path)[1])


def _process(job, mapping, options):
    headers, rows = _load(job)
    mapping = _check_mapping(job.dataset_type, mapping, headers)
    out, report, issues = I.run(g.ws, job, headers, rows, job.dataset_type, mapping, options, I.existing_map(g.ws.id))
    return mapping, out, report, issues


@bp.get("/schema")
@require("data.import")
def schema():
    return ok({"datasets": [dataset_schema(t) for t in DATASET_TYPES], "limits": {"max_mb": config.UPLOAD_LIMIT_MB, "max_rows": config.MAX_IMPORT_ROWS,
                                                                                 "max_columns": config.MAX_IMPORT_COLUMNS}})


@bp.get("/template/<dtype>")
@require("data.import")
def template(dtype):
    if dtype not in DATASETS:
        raise ApiError("Unknown dataset type.", 404)
    cols = [field_spec(dtype, f)[0] for f in DATASETS[dtype]["fields"]]
    buf = io.StringIO()
    csv.writer(buf).writerow(cols)
    return Response(buf.getvalue(), mimetype="text/csv", headers={"Content-Disposition": f"attachment; filename=stockghost_{dtype}_template.csv"})


@bp.post("")
@require("data.import")
def upload():
    dtype = request.form.get("dataset_type", "")
    if dtype not in DATASETS:
        raise ApiError("Choose what kind of data you are uploading.")
    if dtype != "sales" and not can(g.user.role, "inventory.write") and g.user.role not in ("OWNER", "ADMIN"):
        raise ApiError("Your role can only import sales data.", 403)
    f = request.files.get("file")
    if not f or not f.filename:
        raise ApiError("Choose a file to upload.")
    head = f.stream.read(8192)
    f.stream.seek(0, os.SEEK_END)
    size = f.stream.tell()
    f.stream.seek(0)
    try:
        ext = I.check_upload(f.filename, f.mimetype, head, size, config.UPLOAD_LIMIT_MB)
    except I.ImportFailure as e:
        raise ApiError(str(e))
    folder = os.path.join(config.UPLOAD_DIR, str(g.ws.id))
    os.makedirs(folder, exist_ok=True)
    path = os.path.join(folder, uuid.uuid4().hex + ext)          # never use the client's file name on disk
    f.save(path)
    job = ImportJob(workspace_id=g.ws.id, user_id=g.user.id, filename=os.path.basename(f.filename)[:255], stored_path=path, dataset_type=dtype,
                    status="uploaded", file_size=size)
    db.session.add(job)
    try:
        headers, rows = I.read_table(path, ext)
    except I.ImportFailure as e:
        os.remove(path)
        db.session.rollback()
        raise ApiError(str(e))
    job.columns, job.rows_total, job.preview = headers, len(rows), I.preview_rows(rows)
    sug = suggest_mapping(headers, dtype)
    job.mapping = sug
    audit("DATA_UPLOADED", f"{job.filename} ({dtype}, {len(rows):,} rows)")
    db.session.commit()
    return ok({**job.to_dict(True), "suggested_mapping": sug, "schema": dataset_schema(dtype)}, 201)


@bp.post("/<int:jid>/validate")
@require("data.import")
def validate(jid):
    job, d = get_scoped(ImportJob, jid), body()
    opts = _opts(d.get("options"))
    try:
        mapping, _, report, issues = _process(job, d.get("mapping"), opts)
    except (I.ImportFailure,) as e:
        raise ApiError(str(e))
    job.mapping, job.options, job.report, job.issues = mapping, opts, report, issues
    job.rows_total, job.rows_valid, job.rows_rejected = report["rows_total"], report["rows_valid"], report["rows_rejected"]
    job.status = "validated" if job.status != "completed" else job.status
    db.session.commit()
    return ok({"report": report, "issues": issues[:100]})


def _run_import(job, mapping, options, replace_demo, analyse=True):
    ws = g.ws
    if ws.is_demo:
        if not replace_demo:
            return fail("This workspace currently contains SAMPLE data. Importing your own data will remove the sample data first.", 409, code="demo_data_present")
        wipe_business_data(ws.id, keep_job_id=job.id)
        ws.is_demo = False
    mapping, out, report, issues = _process(job, mapping, options)
    job.status, job.mapping, job.options, job.report, job.issues = "importing", mapping, options, report, issues
    I.commit(ws, job, g.user.id, out, job.dataset_type)
    job.rows_total, job.rows_valid, job.rows_rejected = report["rows_total"], report["rows_valid"], report["rows_rejected"]
    job.rows_imported = report["rows_valid"]
    job.status, job.processed_at, job.error_message = "completed", utcnow(), None
    touch(ws)
    audit("DATA_IMPORTED", f"{job.filename}: {report['rows_valid']:,} of {report['rows_total']:,} rows imported "
                           f"({report['rows_rejected']:,} rejected, {report['duplicates_removed']:,} duplicates removed)")
    if analyse:
        db.session.flush()
        run_analysis(ws, commit=False)
        audit("RISK_ANALYSIS", "Risk analysis completed after import")
    notify(ws.id, "import", "Import completed", f"{job.filename}: {report['rows_valid']:,} records imported.", "success", "/data-sources")
    return None


@bp.post("/<int:jid>/confirm")
@require("data.import")
def confirm(jid):
    job, d = get_scoped(ImportJob, jid), body()
    if job.status == "completed":
        raise ApiError("This file was already imported. Use Reprocess to import it again.", 409)
    try:
        resp = _run_import(job, d.get("mapping") or job.mapping, _opts(d.get("options") or job.options), bool(d.get("replace_demo")), d.get("run_analysis", True))
        if resp:
            db.session.rollback()
            return resp
        db.session.commit()
    except (I.ImportFailure, ApiError) as e:
        db.session.rollback()
        raise ApiError(getattr(e, "message", str(e)), getattr(e, "status", 400))
    except Exception:
        log.exception("Import %s failed", jid)
        db.session.rollback()
        job = db.session.get(ImportJob, jid)
        job.status, job.error_message = "failed", GENERIC
        notify(g.ws.id, "import", "Import failed", f"{job.filename} could not be processed. No data was changed.", "critical", "/data-sources")
        audit("DATA_IMPORT_FAILED", job.filename)
        db.session.commit()
        return fail(GENERIC, 500)
    return ok({**job.to_dict(True), "analysis_run": bool(d.get("run_analysis", True))})


@bp.get("")
@require("data.import")
def list_imports():
    items, page = paginate(scoped(ImportJob).order_by(ImportJob.created_at.desc()), 20, 100)
    return ok({"items": [j.to_dict() for j in items], **page})


@bp.get("/<int:jid>")
@require("data.import")
def detail(jid):
    job = get_scoped(ImportJob, jid)
    return ok({**job.to_dict(True), "issues": (job.issues or [])[:200], "schema": dataset_schema(job.dataset_type)})


@bp.get("/<int:jid>/errors.csv")
@require("data.import")
def error_report(jid):
    job = get_scoped(ImportJob, jid)
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["row", "field", "severity", "issue", "detail", "value in file"])
    for i in job.issues or []:
        w.writerow([i["row"], i["field"], i["severity"], i["code"], I.safe_cell(i["message"]), I.safe_cell(i["value"])])
    audit("ERROR_REPORT_DOWNLOADED", job.filename)
    db.session.commit()
    return Response("\ufeff" + buf.getvalue(), mimetype="text/csv", headers={"Content-Disposition": f"attachment; filename=import_{jid}_errors.csv"})


@bp.post("/<int:jid>/reprocess")
@require("data.manage")
def reprocess(jid):
    job = get_scoped(ImportJob, jid)
    if not job.mapping:
        raise ApiError("This file has not been mapped yet. Open it from the import wizard.")
    try:
        I.purge_job_data(g.ws.id, job.id)
        resp = _run_import(job, job.mapping, _opts(job.options), False)
        if resp:
            db.session.rollback()
            return resp
        audit("DATA_REPROCESSED", job.filename)
        db.session.commit()
    except (I.ImportFailure, ApiError) as e:
        db.session.rollback()
        raise ApiError(getattr(e, "message", str(e)), getattr(e, "status", 400))
    except Exception:
        log.exception("Reprocess %s failed", jid)
        db.session.rollback()
        return fail(GENERIC, 500)
    return ok(job.to_dict(True))


@bp.delete("/<int:jid>")
@require("data.manage")
def delete_import(jid):
    job = get_scoped(ImportJob, jid)
    try:
        I.purge_job_data(g.ws.id, job.id)
        name, path = job.filename, job.stored_path
        db.session.delete(job)
        touch(g.ws)
        audit("DATA_DELETED", f"Import '{name}' and the records it created were deleted")
        db.session.flush()
        run_analysis(g.ws, commit=False)
        db.session.commit()
    except Exception:
        log.exception("Delete import %s failed", jid)
        db.session.rollback()
        return fail(GENERIC, 500)
    if path and os.path.exists(path):
        os.remove(path)
    return ok({"message": "Import deleted."})
