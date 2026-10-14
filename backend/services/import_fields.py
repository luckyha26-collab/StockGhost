"""Dataset definitions, column aliases and auto-mapping."""
import difflib
import re

DATASET_TYPES = ("products", "inventory", "sales", "purchases", "suppliers", "combined")

# kind: text | int | num | date
FIELDS = {
    "sku": ("SKU / Item code", "text", ["sku", "item code", "itemcode", "product code", "product id", "item id", "code", "article", "article no",
                                         "barcode", "stock code", "part number", "part no", "material", "material code", "upc"]),
    "product_name": ("Product name", "text", ["product name", "product", "item name", "item", "name", "description", "title", "item description",
                                              "product title", "material description"]),
    "category": ("Category", "text", ["category", "product category", "type", "group", "department", "class", "product type", "item category", "segment"]),
    "cost_price": ("Cost price", "num", ["cost price", "cost", "unit cost", "purchase price", "buying price", "cp", "landed cost", "cost per unit", "buy price"]),
    "selling_price": ("Selling price", "num", ["selling price", "price", "unit price", "sale price", "sp", "mrp", "rate", "sell price", "retail price", "sales price", "unit selling price"]),
    "quantity": ("Quantity", "int", ["quantity", "qty", "qty sold", "units", "units sold", "quantity sold", "sold qty", "stock", "on hand", "stock on hand",
                                     "qty on hand", "current stock", "closing stock", "available", "balance", "qty purchased", "order qty", "quantity ordered", "pieces", "pcs"]),
    "reorder_level": ("Reorder level", "int", ["reorder level", "reorder point", "reorder", "min stock", "minimum stock", "safety stock", "re order level", "rol"]),
    "supplier": ("Supplier", "text", ["supplier", "supplier name", "vendor", "vendor name", "distributor", "manufacturer", "source"]),
    "warehouse": ("Warehouse / location", "text", ["warehouse", "location", "store", "branch", "godown", "site", "storage location", "plant"]),
    "expiry_date": ("Expiry date", "date", ["expiry date", "expiry", "expiration date", "exp date", "best before", "use by", "expires"]),
    "status": ("Status", "text", ["status", "product status", "active"]),
    "last_received_date": ("Last received date", "date", ["last received date", "last received", "received date", "date received", "stock date", "last purchase date", "inward date"]),
    "sale_date": ("Sale date", "date", ["sale date", "date", "order date", "invoice date", "sold on", "transaction date", "sales date", "bill date", "date of sale"]),
    "customer": ("Customer", "text", ["customer", "customer name", "client", "buyer", "party", "customer id"]),
    "region": ("Region", "text", ["region", "state", "city", "zone", "area", "territory", "country"]),
    "order_id": ("Order / invoice no.", "text", ["order id", "order no", "order number", "invoice", "invoice no", "invoice number", "bill no", "reference", "ref", "po number", "po no", "transaction id"]),
    "purchase_date": ("Purchase date", "date", ["purchase date", "date", "order date", "po date", "bill date", "invoice date", "date of purchase", "inward date"]),
    "received_date": ("Received date", "date", ["received date", "date received", "delivery date", "grn date", "arrival date"]),
    "contact": ("Contact person", "text", ["contact", "contact person", "contact name", "person"]),
    "email": ("E-mail", "text", ["email", "e mail", "email address", "mail"]),
    "phone": ("Phone", "text", ["phone", "mobile", "telephone", "contact number", "phone number", "tel"]),
    "lead_time_days": ("Lead time (days)", "int", ["lead time", "lead time days", "lead days", "delivery days", "turnaround"]),
    "transaction_type": ("Transaction type", "text", ["transaction type", "type", "txn type", "movement", "movement type", "entry type"]),
    "transaction_date": ("Transaction date", "date", ["transaction date", "date", "txn date", "order date", "invoice date"]),
    "transaction_quantity": ("Transaction quantity", "int", ["transaction quantity", "quantity", "qty", "units", "txn qty", "movement qty"]),
    "current_stock": ("Current stock", "int", ["current stock", "stock", "on hand", "stock on hand", "closing stock", "qty on hand", "available", "balance"]),
}
SUPPLIER_NAME = ("Supplier name", "text", ["supplier", "supplier name", "vendor", "vendor name", "name", "company", "company name"])

DATASETS = {
    "products": {"label": "Product master", "required": ["sku", "product_name"], "one_of": [],
                 "fields": ["sku", "product_name", "category", "cost_price", "selling_price", "quantity", "reorder_level", "supplier", "warehouse", "expiry_date", "status"]},
    "inventory": {"label": "Inventory (stock on hand)", "required": ["sku", "quantity"], "one_of": [],
                  "fields": ["sku", "quantity", "product_name", "category", "cost_price", "selling_price", "reorder_level", "warehouse", "supplier", "last_received_date", "expiry_date"]},
    "sales": {"label": "Sales data", "required": ["sale_date", "quantity"], "one_of": ["sku", "product_name"],
              "fields": ["sku", "product_name", "quantity", "sale_date", "selling_price", "category", "customer", "region", "order_id"]},
    "purchases": {"label": "Purchase data", "required": ["purchase_date", "quantity"], "one_of": ["sku", "product_name"],
                  "fields": ["sku", "product_name", "quantity", "purchase_date", "cost_price", "supplier", "order_id", "received_date", "category"]},
    "suppliers": {"label": "Supplier data", "required": ["supplier"], "one_of": [],
                  "fields": ["supplier", "contact", "email", "phone", "lead_time_days"]},
    "combined": {"label": "Combined business dataset", "required": [], "one_of": ["sku", "product_name"],
                 "fields": ["sku", "product_name", "category", "cost_price", "selling_price", "current_stock", "reorder_level", "supplier", "warehouse",
                            "region", "customer", "order_id", "transaction_type", "transaction_date", "transaction_quantity"]},
}
EXTRA_ALIASES = {("purchases", "cost_price"): ["price", "rate", "unit price", "unit cost", "purchase rate"],
                 ("purchases", "quantity"): ["qty", "quantity", "units", "qty purchased", "received qty", "order qty"],
                 ("purchases", "supplier"): ["supplier", "vendor", "party", "supplier name"],
                 ("suppliers", "supplier"): SUPPLIER_NAME[2]}


def norm_header(h):
    return " ".join(re.sub(r"[^a-z0-9]+", " ", str(h).lower()).split())


def field_spec(dtype, field):
    if dtype == "suppliers" and field == "supplier":
        label, kind, aliases = SUPPLIER_NAME
    else:
        label, kind, aliases = FIELDS[field]
    aliases = list(aliases) + EXTRA_ALIASES.get((dtype, field), [])
    return label, kind, aliases


def dataset_schema(dtype):
    d = DATASETS[dtype]
    return {"type": dtype, "label": d["label"], "required": d["required"], "one_of": d["one_of"],
            "fields": [{"name": f, "label": field_spec(dtype, f)[0], "kind": field_spec(dtype, f)[1],
                        "required": f in d["required"], "one_of": f in d["one_of"]} for f in d["fields"]]}


def suggest_mapping(headers, dtype):
    """-> {field: header} using alias / token / fuzzy matching. Each header and field is used at most once."""
    normed = {h: norm_header(h) for h in headers}
    scored = []
    for f in DATASETS[dtype]["fields"]:
        _, _, aliases = field_spec(dtype, f)
        na = [norm_header(a) for a in aliases] + [norm_header(f)]
        for h, nh in normed.items():
            if not nh:
                continue
            best = 0.0
            for a in na:
                if nh == a:
                    best = 1.0
                    break
                if a in nh.split() or (len(a) > 3 and a in nh) or (len(nh) > 3 and nh in a):
                    best = max(best, 0.86)
                else:
                    r = difflib.SequenceMatcher(None, nh, a).ratio()
                    if r >= 0.84:
                        best = max(best, r * 0.95)
            if best >= 0.8:
                # prefer the first (most canonical) alias position as a tie-break
                scored.append((best, -na.index(next((a for a in na if a == nh), na[-1])) if nh in na else 0, f, h))
    scored.sort(key=lambda t: (-t[0], -t[1]))
    out, used = {}, set()
    for _, _, f, h in scored:
        if f not in out and h not in used:
            out[f] = h
            used.add(h)
    return out
