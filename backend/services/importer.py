"""File reading, validation, cleaning and import. Rows are NEVER silently dropped: everything rejected,
removed or modified is counted in the job report and listed in the downloadable error report."""
import collections
import csv
import datetime as dt
import hashlib
import io
import math
import os
import re
import statistics
import zipfile

from sqlalchemy import delete, func

from config import MAX_IMPORT_COLUMNS, MAX_IMPORT_ROWS
from extensions import db
from models import (ImportJob, InventoryTransaction, Product, Purchase, RiskAnalysis, Sale, Supplier, utcnow)
from services.import_fields import DATASETS, field_spec

ALLOWED_EXT = {".csv", ".xlsx", ".xls"}
ALLOWED_MIME = {"", "text/csv", "text/plain", "application/csv", "text/x-csv", "application/x-csv", "application/vnd.ms-excel",
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/octet-stream", "application/excel"}
MAX_ISSUES_STORED = 5000

ISSUE_LABELS = {
    "missing_required": "Missing required value", "invalid_date": "Invalid date", "future_date": "Date is in the future",
    "invalid_number": "Invalid number", "negative_quantity": "Negative or zero quantity", "negative_price": "Negative price",
    "missing_price": "Missing price", "missing_cost": "Missing cost price", "missing_sku": "Missing SKU",
    "unknown_product": "Product not found", "duplicate_row": "Duplicate row", "duplicate_sku": "Duplicate SKU in file",
    "inconsistent_name": "Inconsistent product name", "outlier": "Possible outlier", "invalid_value": "Invalid value",
    "invalid_inventory": "Invalid inventory quantity", "decimal_quantity": "Decimal quantity", "sku_normalized": "SKU normalised",
    "name_normalized": "Product name normalised", "text_cleaned": "Whitespace cleaned", "number_cleaned": "Currency/commas removed",
    "date_normalized": "Date normalised", "price_filled": "Missing price filled from product master", "sku_generated": "SKU generated from name",
}


class ImportFailure(Exception):
    """A problem with the uploaded file that is safe to show to the user."""


# ---- reading & upload validation ----------------------------------------------------------------------
def check_upload(filename, mimetype, head, size, limit_mb):
    ext = os.path.splitext(filename or "")[1].lower()
    if ext not in ALLOWED_EXT:
        raise ImportFailure("Unsupported file type. Please upload a .csv, .xlsx or .xls file.")
    if (mimetype or "").lower() not in ALLOWED_MIME:
        raise ImportFailure("This file type is not allowed. Upload a CSV or Excel file.")
    if size <= 0:
        raise ImportFailure("The file is empty.")
    if size > limit_mb * 1024 * 1024:
        raise ImportFailure(f"The file is larger than the {limit_mb} MB limit.")
    if ext == ".xlsx" and not head.startswith(b"PK\x03\x04"):
        raise ImportFailure("This does not look like a valid Excel (.xlsx) file.")
    if ext == ".xls" and not head.startswith(b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"):
        raise ImportFailure("This does not look like a valid Excel (.xls) file.")
    if ext == ".csv":
        if b"\x00" in head or head[:2] == b"MZ" or head[:4] == b"\x7fELF" or head.lstrip()[:1] == b"<" or head[:2] == b"#!":
            raise ImportFailure("This file does not look like a CSV file.")
    return ext


def _decode(raw):
    for enc in ("utf-8-sig", "cp1252", "latin-1"):
        try:
            return raw.decode(enc)
        except UnicodeDecodeError:
            continue
    raise ImportFailure("The file encoding is not supported. Save it as UTF-8 CSV and try again.")


def _unique_headers(raw):
    seen, out = collections.Counter(), []
    for i, h in enumerate(raw):
        h = " ".join(str(h if h is not None else "").split()) or f"Column {i + 1}"
        seen[h] += 1
        out.append(h if seen[h] == 1 else f"{h} ({seen[h]})")
    return out


def read_table(path, ext):
    """-> (headers, rows). rows are lists aligned to headers (cell values are str, numbers or dates)."""
    try:
        if ext == ".csv":
            with open(path, "rb") as fh:
                text = _decode(fh.read())
            sample = text[:20000]
            try:
                delim = csv.Sniffer().sniff(sample, delimiters=",;\t|").delimiter
            except csv.Error:
                delim = ","
            data = list(csv.reader(io.StringIO(text), delimiter=delim))
        elif ext == ".xlsx":
            with zipfile.ZipFile(path) as z:
                if sum(i.file_size for i in z.infolist()) > 400 * 1024 * 1024 or "xl/workbook.xml" not in z.namelist():
                    raise ImportFailure("This Excel file cannot be read safely.")
            import openpyxl
            wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
            data = []
            for ws in wb.worksheets:
                data = []
                for row in ws.iter_rows(values_only=True):
                    data.append(list(row))
                    if len(data) > MAX_IMPORT_ROWS + 1:
                        break
                if any(any(c not in (None, "") for c in r) for r in data):
                    break
            wb.close()
        else:
            import xlrd
            book = xlrd.open_workbook(path)
            data = []
            for sh in book.sheets():
                data = []
                for r in range(sh.nrows):
                    row = []
                    for c in range(sh.ncols):
                        cell = sh.cell(r, c)
                        if cell.ctype == xlrd.XL_CELL_DATE:
                            row.append(xlrd.xldate_as_datetime(cell.value, book.datemode))
                        elif cell.ctype in (xlrd.XL_CELL_EMPTY, xlrd.XL_CELL_BLANK):
                            row.append(None)
                        else:
                            row.append(cell.value)
                    data.append(row)
                if data:
                    break
    except ImportFailure:
        raise
    except Exception:
        raise ImportFailure("The file could not be read. Check that it is a valid, unprotected CSV or Excel file.")
    data = [r for r in data if any(c not in (None, "") and str(c).strip() != "" for c in r)]
    if len(data) < 2:
        raise ImportFailure("The file needs a header row and at least one data row.")
    headers = _unique_headers(data[0])
    if len(headers) > MAX_IMPORT_COLUMNS:
        raise ImportFailure(f"The file has {len(headers)} columns; the limit is {MAX_IMPORT_COLUMNS}.")
    rows = data[1:]
    if len(rows) > MAX_IMPORT_ROWS:
        raise ImportFailure(f"The file has {len(rows):,} rows; the limit is {MAX_IMPORT_ROWS:,}. Split it into smaller files.")
    width = len(headers)
    rows = [(r + [None] * (width - len(r)))[:width] for r in rows]
    return headers, rows


def preview_rows(rows, n=8):
    def s(v):
        return "" if v is None else (v.isoformat()[:10] if isinstance(v, (dt.date, dt.datetime)) else str(v)[:60])
    return [[s(c) for c in r] for r in rows[:n]]


# ---- parsing helpers ---------------------------------------------------------------------------------------
_CUR = re.compile(r"[₹$€£\s]|\brs\.?|\binr\b|\busd\b", re.I)
_EMPTY = {"", "nan", "null", "none", "n/a", "na", "-", "--", "#n/a"}
_DATE_FMTS = ["%Y-%m-%d", "%Y/%m/%d", "%d-%b-%Y", "%d %b %Y", "%d %B %Y", "%b %d, %Y", "%B %d, %Y", "%d-%b-%y", "%Y.%m.%d"]
_DAYFIRST = ["%d/%m/%Y", "%d-%m-%Y", "%d.%m.%Y", "%d/%m/%y", "%d-%m-%y"]
_MONTHFIRST = ["%m/%d/%Y", "%m-%d-%Y", "%m/%d/%y", "%m-%d-%y"]
_NUMDATE = re.compile(r"^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$")


def parse_num(v):
    """-> (value|None, status, cleaned)"""
    if v is None:
        return None, "empty", False
    if isinstance(v, bool):
        return None, "invalid", False
    if isinstance(v, (int, float)):
        return (None, "invalid", False) if (v != v or abs(v) == math.inf) else (float(v), "ok", False)
    s = str(v).strip()
    if s.lower() in _EMPTY:
        return None, "empty", False
    neg = s.startswith("(") and s.endswith(")")
    t = _CUR.sub("", s).replace(",", "").strip("()")
    try:
        x = float(t)
    except ValueError:
        return None, "invalid", False
    if x != x or abs(x) == math.inf:
        return None, "invalid", False
    return (-x if neg else x), "ok", t != s


def detect_dayfirst(values, mode="auto"):
    if mode == "dayfirst":
        return True
    if mode == "monthfirst":
        return False
    for v in values:
        m = _NUMDATE.match(str(v).strip()) if isinstance(v, str) else None
        if m and int(m.group(1)) > 12:
            return True
        if m and int(m.group(2)) > 12:
            return False
    return True


def parse_date(v, dayfirst=True):
    """-> (date|None, status, normalised)"""
    if v is None:
        return None, "empty", False
    if isinstance(v, dt.datetime):
        d = v.date()
    elif isinstance(v, dt.date):
        d = v
    elif isinstance(v, (int, float)) and not isinstance(v, bool):
        if 20000 < v < 80000:
            d = (dt.datetime(1899, 12, 30) + dt.timedelta(days=float(v))).date()
            return _range_check(d, True)
        return None, "invalid", False
    else:
        s = str(v).strip()
        if s.lower() in _EMPTY:
            return None, "empty", False
        m = re.match(r"^(\d{4}-\d{2}-\d{2})(?:[T ].*)?$", s)
        if m:
            try:
                return _range_check(dt.date.fromisoformat(m.group(1)), s != m.group(1))
            except ValueError:
                return None, "invalid", False
        d = None
        for fmt in _DATE_FMTS + (_DAYFIRST + _MONTHFIRST if dayfirst else _MONTHFIRST + _DAYFIRST):
            try:
                d = dt.datetime.strptime(s, fmt).date()
                break
            except ValueError:
                continue
        if d is None:
            return None, "invalid", False
        return _range_check(d, True)
    return _range_check(d, isinstance(v, dt.datetime))


def _range_check(d, normalised):
    if d.year < 1990:
        return None, "invalid", False
    if d > dt.date.today() + dt.timedelta(days=1):
        return d, "future", normalised
    return d, "ok", normalised


def norm_sku(s):
    return " ".join(str(s).split()).upper()


def norm_text(s):
    return " ".join(str(s).split())


# ---- processing --------------------------------------------------------------------------------------------
class Processor:
    def __init__(self, ws, headers, dtype, mapping, options, existing_products):
        self.ws, self.dtype, self.opt = ws, dtype, options
        self.idx = {f: headers.index(h) for f, h in mapping.items() if h in headers and f in DATASETS[dtype]["fields"]}
        self.kinds = {f: field_spec(dtype, f)[1] for f in self.idx}
        self.existing = existing_products          # sku -> dict(name, selling_price, cost_price)
        self.name_to_sku = {}
        for sku, p in existing_products.items():
            self.name_to_sku.setdefault(p["name"].lower(), sku)
        self.issues, self.counts = [], collections.defaultdict(lambda: {"count": 0, "severity": "warning", "rows": set()})
        self.fixes = collections.Counter()
        self.row_error = False
        self.rown = 0
        self.dayfirst = {}

    # issue bookkeeping
    def add(self, field, code, value=None, sev="warning", msg=None):
        c = self.counts[code]
        c["count"] += 1
        c["severity"] = sev
        c["rows"].add(self.rown)
        if sev == "error":
            self.row_error = True
        if len(self.issues) < MAX_ISSUES_STORED:
            self.issues.append({"row": self.rown, "field": field, "code": code, "severity": sev,
                                "message": msg or ISSUE_LABELS.get(code, code), "value": "" if value is None else str(value)[:80]})

    def fix(self, code):
        self.fixes[code] += 1
        self.counts[code]["severity"] = "fixed"
        self.counts[code]["count"] += 1

    # cell access
    def raw(self, row, f):
        i = self.idx.get(f)
        return None if i is None else row[i]

    def text(self, row, f, maxlen=200):
        v = self.raw(row, f)
        if v is None:
            return None
        if isinstance(v, float) and v == int(v):
            v = int(v)
        s = norm_text(v)
        if s.lower() in _EMPTY:
            return None
        if s != str(v).strip():
            self.fix("text_cleaned")
        return s[:maxlen]

    def number(self, row, f, minimum=None, integer=False, required=False, allow_zero=True):
        v = self.raw(row, f)
        x, st, cleaned = parse_num(v)
        label = field_spec(self.dtype, f)[0]
        if st == "empty":
            if required:
                self.add(f, "missing_required", None, "error", f"{label} is missing")
            return None
        if st == "invalid":
            self.add(f, "invalid_number", v, "error", f"{label} is not a valid number")
            return None
        if cleaned:
            self.fix("number_cleaned")
        if integer and abs(x - round(x)) > 1e-9:
            if self.opt.get("auto_fix"):
                x = float(round(x))
                self.fix("decimal_quantity")
            else:
                self.add(f, "invalid_number", v, "error", f"{label} must be a whole number")
                return None
        if minimum is not None and (x < minimum or (not allow_zero and x == 0)):
            code = "negative_quantity" if integer else "negative_price"
            self.add(f, code, v, "error", f"{label} must be {'greater than 0' if not allow_zero else 'at least ' + str(minimum)}")
            return None
        return int(round(x)) if integer else x

    def date(self, row, f, required=True, allow_future=False):
        v = self.raw(row, f)
        label = field_spec(self.dtype, f)[0]
        d, st, normed = parse_date(v, self.dayfirst.get(f, True))
        if st == "empty":
            if required:
                self.add(f, "missing_required", None, "error", f"{label} is missing")
            return None
        if st == "invalid":
            self.add(f, "invalid_date", v, "error", f"{label} is not a valid date")
            return None
        if st == "future" and not allow_future:
            self.add(f, "future_date", v, "error", f"{label} is in the future")
            return None
        if normed:
            self.fix("date_normalized")
        return d

    def prepare(self, rows):
        for f, i in self.idx.items():
            if self.kinds[f] == "date":
                self.dayfirst[f] = detect_dayfirst((r[i] for r in rows[:2000]), self.opt.get("date_format", "auto"))

    # product identification --------------------------------------------------------------------------------
    def identify(self, row, create_ok=True):
        """-> (sku, name) or (None, None) after recording an error."""
        raw_sku, raw_name = self.raw(row, "sku"), self.raw(row, "product_name")
        sku = None
        if raw_sku is not None and str(raw_sku).strip().lower() not in _EMPTY:
            v = raw_sku
            if isinstance(v, float) and v == int(v):
                v = int(v)
            sku = norm_sku(v)[:60]
            if sku != str(v).strip():
                self.fix("sku_normalized")
        name = self.text(row, "product_name") if "product_name" in self.idx else None
        if name and norm_text(raw_name) != str(raw_name).strip():
            self.fix("name_normalized")
        if not sku:
            if name and name.lower() in self.name_to_sku:
                return self.name_to_sku[name.lower()], name
            if name and self.opt.get("auto_fix") and create_ok:
                sku = "AUTO-" + hashlib.md5(name.lower().encode()).hexdigest()[:8].upper()
                self.fix("sku_generated")
                return sku, name
            self.add("sku", "missing_sku", None, "error", "SKU is missing" + (" and the product name matches no existing product" if name else ""))
            return None, None
        return sku, name


def run(ws, job, headers, rows, dtype, mapping, options, existing_products):
    """Validate + clean. Returns dict(records..., stats, issues). Does not touch the database."""
    P = Processor(ws, headers, dtype, mapping, options, existing_products)
    P.prepare(rows)
    stats = collections.Counter()
    out = {"products": {}, "sales": [], "purchases": [], "suppliers": {}, "snapshots": []}
    seen, name_votes = set(), collections.defaultdict(collections.Counter)
    rows_total = len(rows)
    rejected_rows, dup_removed = 0, 0

    def upsert_product(sku, **fields):
        p = out["products"].setdefault(sku, {})
        for k, v in fields.items():
            if v is not None:
                p[k] = v
        return p

    for n, row in enumerate(rows, start=2):                 # row 1 is the header
        P.rown, P.row_error = n, False
        rec = None
        if dtype in ("products", "inventory"):
            sku, name = P.identify(row)
            qty = P.number(row, "quantity", 0, integer=True, required=(dtype == "inventory")) if "quantity" in P.idx else None
            cost = P.number(row, "cost_price", 0) if "cost_price" in P.idx else None
            price = P.number(row, "selling_price", 0) if "selling_price" in P.idx else None
            reorder = P.number(row, "reorder_level", 0, integer=True) if "reorder_level" in P.idx else None
            received = P.date(row, "last_received_date", required=False) if "last_received_date" in P.idx else None
            expiry = P.date(row, "expiry_date", required=False, allow_future=True) if "expiry_date" in P.idx else None
            if sku and name is None and sku not in existing_products and dtype == "products":
                P.add("product_name", "missing_required", None, "error", "Product name is missing")
            if "cost_price" in P.idx and cost is None and not P.row_error:
                P.add("cost_price", "missing_cost", None, "warning", "Cost price missing - inventory value will be 0 for this product")
            if "selling_price" in P.idx and price is None and not P.row_error:
                P.add("selling_price", "missing_price", None, "warning", "Selling price missing")
            if not P.row_error:
                st = (P.text(row, "status") or "active").lower()
                rec = dict(sku=sku, name=name, category=P.text(row, "category", 80), cost_price=cost, selling_price=price, quantity=qty,
                           reorder_level=reorder, supplier=P.text(row, "supplier", 160), warehouse=P.text(row, "warehouse", 80),
                           expiry_date=expiry, last_received=received, status="discontinued" if st in ("discontinued", "inactive", "no", "false", "0") else "active")
        elif dtype == "suppliers":
            nm = P.text(row, "supplier", 160)
            if not nm:
                P.add("supplier", "missing_required", None, "error", "Supplier name is missing")
            lead = P.number(row, "lead_time_days", 0, integer=True) if "lead_time_days" in P.idx else None
            if not P.row_error:
                rec = dict(name=nm, contact=P.text(row, "contact"), email=P.text(row, "email"), phone=P.text(row, "phone", 60), lead_time_days=lead)
        elif dtype in ("sales", "purchases"):
            datef = "sale_date" if dtype == "sales" else "purchase_date"
            sku, name = P.identify(row)
            d = P.date(row, datef)
            qty = P.number(row, "quantity", 1, integer=True, required=True, allow_zero=False) if "quantity" in P.idx else None
            if "quantity" not in P.idx:
                P.add("quantity", "missing_required", None, "error")
            pf = "selling_price" if dtype == "sales" else "cost_price"
            price = P.number(row, pf, 0) if pf in P.idx else None
            if sku and not P.row_error:
                known = existing_products.get(sku)
                if not known and sku not in out["products"] and not name:
                    P.add("sku", "unknown_product", sku, "error", f"SKU {sku} is not in your products and no product name was provided")
            if price is None and not P.row_error:
                known = existing_products.get(sku) if sku else None
                fill = (known or {}).get(pf)
                if P.opt.get("auto_fix") and fill:
                    price = fill
                    P.fix("price_filled")
                else:
                    P.add(pf, "missing_price", None, "warning", "Price missing" + (" - will use the product's current price" if fill else ""))
                    price = None
            received = P.date(row, "received_date", required=False) if "received_date" in P.idx else None
            if not P.row_error:
                rec = dict(sku=sku, name=name, quantity=qty, date=d, price=price, category=P.text(row, "category", 80),
                           customer=P.text(row, "customer", 120), region=P.text(row, "region", 80), order=P.text(row, "order_id", 80),
                           supplier=P.text(row, "supplier", 160), received=received)
        else:                                                   # combined
            sku, name = P.identify(row)
            ttype = (P.text(row, "transaction_type") or "").lower() if "transaction_type" in P.idx else ""
            has_txn = bool(ttype) or any(P.raw(row, f) not in (None, "") for f in ("transaction_date", "transaction_quantity") if f in P.idx)
            cost = P.number(row, "cost_price", 0) if "cost_price" in P.idx else None
            price = P.number(row, "selling_price", 0) if "selling_price" in P.idx else None
            stock = P.number(row, "current_stock", 0, integer=True) if "current_stock" in P.idx else None
            reorder = P.number(row, "reorder_level", 0, integer=True) if "reorder_level" in P.idx else None
            txn = None
            if has_txn:
                kind = "sale" if ttype in ("sale", "sales", "sold", "out", "s", "sell", "issue") else "purchase" if ttype in ("purchase", "purchases", "buy", "in", "received", "p", "grn", "receipt") else None
                if kind is None:
                    P.add("transaction_type", "invalid_value", ttype, "error", "Transaction type must be sale or purchase")
                d = P.date(row, "transaction_date")
                q = P.number(row, "transaction_quantity", 1, integer=True, required=True, allow_zero=False)
                if kind and not P.row_error:
                    txn = dict(kind=kind, date=d, quantity=q)
            if not P.row_error:
                rec = dict(sku=sku, name=name, category=P.text(row, "category", 80), cost_price=cost, selling_price=price, stock=stock,
                           reorder_level=reorder, supplier=P.text(row, "supplier", 160), warehouse=P.text(row, "warehouse", 80),
                           region=P.text(row, "region", 80), customer=P.text(row, "customer", 120), order=P.text(row, "order_id", 80), txn=txn)

        if P.row_error or rec is None:
            rejected_rows += 1
            continue
        # exact-duplicate detection on the cleaned record
        dk = (dtype,) + tuple(sorted((k, str(v)) for k, v in _flat(rec).items() if v is not None))
        if dk in seen and dtype not in ("products", "inventory", "suppliers"):
            dup_removed_here = P.opt.get("remove_duplicates", True)
            P.add("", "duplicate_row", None, "fixed" if dup_removed_here else "warning", "Identical to an earlier row" + (" - removed" if dup_removed_here else ""))
            if dup_removed_here:
                dup_removed += 1
                continue
        seen.add(dk)
        rec["_row"] = n
        _collect(out, dtype, rec, upsert_product, name_votes, existing_products)

    # whole-file checks ------------------------------------------------------------------------------------------
    dup_sku = out.pop("_dup_sku", [])
    for rn, sku in dup_sku:
        P.rown = rn
        P.add("sku", "duplicate_sku", sku, "fixed", f"SKU {sku} appears more than once - the last occurrence was kept")
        dup_removed += 1
    for sku, votes in name_votes.items():
        if len({k.lower() for k in votes}) > 1:
            best = votes.most_common(1)[0][0]
            P.rown = 0
            P.add("product_name", "inconsistent_name", sku, "warning", f"SKU {sku} appears with different names; using '{best}'")
            if sku in out["products"]:
                out["products"][sku]["name"] = best
    if dtype in ("sales", "purchases", "combined"):
        _outliers(P, out, dtype, options)
    # classify products ---------------------------------------------------------------------------------------------
    created = sum(1 for s in out["products"] if s not in existing_products)
    updated = len(out["products"]) - created
    valid = {"sales": lambda: len(out["sales"]), "purchases": lambda: len(out["purchases"]),
             "suppliers": lambda: len(out["suppliers"]), "products": lambda: len(out["products"]),
             "inventory": lambda: len(out["products"]), "combined": lambda: out.get("valid_rows", 0)}[dtype]()
    warn_rows = len({r for c, v in P.counts.items() if v["severity"] == "warning" for r in v["rows"] if r})
    by_code = [{"code": c, "label": ISSUE_LABELS.get(c, c), "severity": v["severity"], "count": v["count"]}
               for c, v in P.counts.items() if v["count"]]
    by_code.sort(key=lambda x: ({"error": 0, "warning": 1, "fixed": 2}[x["severity"]], -x["count"]))
    report = {
        "rows_total": rows_total, "rows_valid": valid, "rows_rejected": rejected_rows, "duplicates_removed": dup_removed,
        "rows_with_warnings": warn_rows, "products_created": created, "products_updated": updated,
        "suppliers_seen": len(out["suppliers"]),
        "by_code": by_code, "cleaning": [{"code": k, "label": ISSUE_LABELS.get(k, k), "count": v} for k, v in P.fixes.items() if v],
        "rows_after_cleaning": valid,
        "issue_count_stored": len(P.issues),
        "options": {k: options.get(k) for k in ("auto_fix", "remove_duplicates", "exclude_outliers", "date_format")},
    }
    return out, report, P.issues


def _flat(rec):
    out = {}
    for k, v in rec.items():
        if k == "txn" and v:
            out.update({"txn_" + a: b for a, b in v.items()})
        elif not k.startswith("_"):
            out[k] = v
    return out


def _collect(out, dtype, rec, upsert, votes, existing):
    n = rec["_row"]
    if dtype in ("products", "inventory"):
        sku = rec["sku"]
        if sku in out["products"]:
            out.setdefault("_dup_sku", []).append((out["products"][sku]["_row"], sku))
        out["products"][sku] = {k: v for k, v in rec.items() if v is not None and k != "sku"} | {"_row": n}
        if rec["name"]:
            votes[sku][rec["name"]] += 1
    elif dtype == "suppliers":
        out["suppliers"][rec["name"].lower()] = {k: v for k, v in rec.items() if v is not None} | {"_new": True}
    elif dtype in ("sales", "purchases"):
        sku = rec["sku"]
        if rec["name"]:
            votes[sku][rec["name"]] += 1
        if sku not in existing:
            upsert(sku, name=rec["name"], category=rec["category"], **({"selling_price": rec["price"]} if dtype == "sales" else {"cost_price": rec["price"]}))
        if rec["supplier"] and dtype == "purchases":
            out["suppliers"].setdefault(rec["supplier"].lower(), {"name": rec["supplier"], "_new": True})
        out[dtype].append(rec)
    else:
        sku = rec["sku"]
        if rec["name"]:
            votes[sku][rec["name"]] += 1
        fields = dict(name=rec["name"], category=rec["category"], cost_price=rec["cost_price"], selling_price=rec["selling_price"],
                      quantity=rec["stock"], reorder_level=rec["reorder_level"], supplier=rec["supplier"], warehouse=rec["warehouse"])
        upsert(sku, **fields)
        if rec["supplier"]:
            out["suppliers"].setdefault(rec["supplier"].lower(), {"name": rec["supplier"], "_new": True})
        t = rec["txn"]
        if t:
            base = dict(sku=sku, name=rec["name"], quantity=t["quantity"], date=t["date"], category=rec["category"], customer=rec["customer"],
                        region=rec["region"], order=rec["order"], supplier=rec["supplier"], received=None)
            if t["kind"] == "sale":
                out["sales"].append({**base, "price": rec["selling_price"]})
            else:
                out["purchases"].append({**base, "price": rec["cost_price"]})
        out["valid_rows"] = out.get("valid_rows", 0) + 1


def _outliers(P, out, dtype, options):
    for key in ("sales", "purchases"):
        recs = out[key]
        qs = sorted(r["quantity"] for r in recs)
        if len(qs) < 30:
            continue
        q1, q3 = qs[len(qs) // 4], qs[(3 * len(qs)) // 4]
        hi = q3 + 3 * max(1, q3 - q1)
        flagged = [r for r in recs if r["quantity"] > hi]
        for r in flagged[:500]:
            P.rown = r.get("_row", 0)
            P.add("quantity", "outlier", r["quantity"], "warning", f"Quantity {r['quantity']} is far above typical ({hi:.0f}+)")
        if len(flagged) > 500:
            P.counts["outlier"]["count"] += len(flagged) - 500
        if options.get("exclude_outliers") and flagged:
            ids = {id(r) for r in flagged}
            out[key] = [r for r in recs if id(r) not in ids]
            for _ in flagged:
                P.counts["outlier"]["severity"] = "fixed"
            out["valid_rows"] = out.get("valid_rows", 0) - len(flagged)


# ---- database helpers --------------------------------------------------------------------------------------------
def existing_map(ws_id):
    return {p.sku: {"id": p.id, "name": p.name, "selling_price": p.selling_price, "cost_price": p.cost_price}
            for p in Product.query.filter_by(workspace_id=ws_id)}


def recompute_derived_stock(ws_id):
    sold = dict(db.session.query(Sale.product_id, func.sum(Sale.quantity)).filter(Sale.workspace_id == ws_id).group_by(Sale.product_id))
    bought = dict(db.session.query(Purchase.product_id, func.sum(Purchase.quantity)).filter(Purchase.workspace_id == ws_id).group_by(Purchase.product_id))
    for p in Product.query.filter_by(workspace_id=ws_id, stock_source="derived"):
        p.quantity = max(0, int(bought.get(p.id, 0)) - int(sold.get(p.id, 0)))


def commit(ws, job, user_id, out, dtype):
    """Write validated records inside the caller's transaction (caller commits / rolls back)."""
    ws_id = ws.id
    sup_cache = {s.name.lower(): s for s in Supplier.query.filter_by(workspace_id=ws_id)}

    def supplier(name):
        if not name:
            return None
        s = sup_cache.get(name.lower())
        if not s:
            s = Supplier(workspace_id=ws_id, name=name[:160], import_id=job.id)
            db.session.add(s)
            db.session.flush()
            sup_cache[name.lower()] = s
        return s

    if dtype == "suppliers":
        for key, d in out["suppliers"].items():
            s = sup_cache.get(key)
            if not s:
                s = Supplier(workspace_id=ws_id, name=d["name"], import_id=job.id)
                db.session.add(s)
                sup_cache[key] = s
            for k in ("contact", "email", "phone", "lead_time_days"):
                if d.get(k) is not None:
                    setattr(s, k, d[k])
        return
    for d in out["suppliers"].values():
        supplier(d["name"])
    prods = {p.sku: p for p in Product.query.filter_by(workspace_id=ws_id)}
    new_objs = []
    snap_tx = []
    for sku, d in out["products"].items():
        p = prods.get(sku)
        is_new = p is None
        if is_new:
            p = Product(workspace_id=ws_id, sku=sku, name=(d.get("name") or sku)[:200], category=d.get("category") or "Uncategorized",
                        cost_price=0, selling_price=0, quantity=0, reorder_level=10, stock_source="derived", import_id=job.id)
            db.session.add(p)
            new_objs.append(p)
            prods[sku] = p
        if d.get("name") and not is_new:
            p.name = d["name"][:200]
        for src, dst in (("category", "category"), ("cost_price", "cost_price"), ("selling_price", "selling_price"),
                         ("reorder_level", "reorder_level"), ("warehouse", "warehouse"), ("expiry_date", "expiry_date"), ("status", "status")):
            if d.get(src) is not None:
                setattr(p, dst, d[src])
        if d.get("supplier"):
            s = supplier(d["supplier"])
            p.supplier_id = s.id
        if d.get("quantity") is not None:
            p.quantity = int(d["quantity"])
            p.stock_source = "snapshot"
            snap_tx.append((p, d))
    db.session.flush()
    for p, d in snap_tx:
        db.session.add(InventoryTransaction(workspace_id=ws_id, product_id=p.id, transaction_type="SNAPSHOT", quantity=p.quantity,
                                            date=dt.date.today(), note=f"Stock snapshot from {job.filename}"[:250], user_id=user_id, import_id=job.id))
        if d.get("last_received") and p.quantity > 0:
            db.session.add(InventoryTransaction(workspace_id=ws_id, product_id=p.id, transaction_type="OPENING_STOCK", quantity=p.quantity,
                                                date=d["last_received"], note="Last received date from import", user_id=user_id, import_id=job.id))
    ids = {sku: p.id for sku, p in prods.items()}
    if out["sales"]:
        rows = []
        for r in out["sales"]:
            pid = ids.get(r["sku"])
            if pid is None:
                continue
            price = r["price"] if r["price"] is not None else prods[r["sku"]].selling_price or None
            rows.append(dict(workspace_id=ws_id, product_id=pid, quantity=r["quantity"], unit_price=price, sale_date=r["date"], customer=r["customer"],
                             region=r["region"], order_ref=r["order"], import_id=job.id, created_by=user_id))
        for i in range(0, len(rows), 5000):
            db.session.bulk_insert_mappings(Sale, rows[i:i + 5000])
    if out["purchases"]:
        rows = []
        for r in out["purchases"]:
            pid = ids.get(r["sku"])
            if pid is None:
                continue
            s = supplier(r["supplier"]) if r.get("supplier") else prods[r["sku"]].supplier
            cost = r["price"] if r["price"] is not None else prods[r["sku"]].cost_price or None
            rows.append(dict(workspace_id=ws_id, product_id=pid, supplier_id=s.id if s else None, quantity=r["quantity"], unit_cost=cost,
                             purchase_date=r["date"], received_date=r.get("received"), reference=r["order"], import_id=job.id, created_by=user_id))
        for i in range(0, len(rows), 5000):
            db.session.bulk_insert_mappings(Purchase, rows[i:i + 5000])
        # fill product cost / supplier from purchases where the master has none
        for r in out["purchases"]:
            p = prods.get(r["sku"])
            if p and not p.cost_price and r["price"]:
                p.cost_price = r["price"]
            if p and not p.supplier_id and r.get("supplier"):
                p.supplier_id = supplier(r["supplier"]).id
    if out["sales"]:
        for r in out["sales"]:
            p = prods.get(r["sku"])
            if p and not p.selling_price and r["price"]:
                p.selling_price = r["price"]
    db.session.flush()
    recompute_derived_stock(ws_id)


def purge_job_data(ws_id, job_id):
    """Remove everything a given import created (used by delete and reprocess)."""
    for model in (Sale, Purchase, InventoryTransaction):
        db.session.execute(delete(model).where(model.workspace_id == ws_id, model.import_id == job_id))
    created = [p.id for p in Product.query.filter_by(workspace_id=ws_id, import_id=job_id)]
    for pid in created:
        refs = (Sale.query.filter_by(workspace_id=ws_id, product_id=pid).first() or Purchase.query.filter_by(workspace_id=ws_id, product_id=pid).first()
                or InventoryTransaction.query.filter_by(workspace_id=ws_id, product_id=pid).first())
        if not refs:
            db.session.execute(delete(RiskAnalysis).where(RiskAnalysis.workspace_id == ws_id, RiskAnalysis.product_id == pid))
            db.session.execute(delete(Product).where(Product.workspace_id == ws_id, Product.id == pid))
        else:
            Product.query.filter_by(id=pid).update({"import_id": None})
    for s in Supplier.query.filter_by(workspace_id=ws_id, import_id=job_id):
        if not Product.query.filter_by(workspace_id=ws_id, supplier_id=s.id).first() and not Purchase.query.filter_by(workspace_id=ws_id, supplier_id=s.id).first():
            db.session.delete(s)
        else:
            s.import_id = None
    db.session.flush()
    recompute_derived_stock(ws_id)


def safe_cell(v):
    """Neutralise spreadsheet formula injection in exported/echoed text."""
    if isinstance(v, str) and v[:1] in ("=", "+", "-", "@", "\t", "\r"):
        return "'" + v
    return v
