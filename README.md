# StockGhost — multi-tenant inventory intelligence

StockGhost finds **dead stock, blocked capital and stock-out risk** from a business's *own* sales, purchase and
inventory files. A company registers, uploads CSV/Excel data, StockGhost validates and cleans it, then calculates
risk scores, forecasts and recommendations. Everything shown comes from database records belonging to the
signed-in user's workspace — there is no hard-coded business data in the application.

```
Landing → Register → Onboarding → Upload → Map columns → Validate & clean → Import → Analyse → Dashboard
```

## Contents
1. [Architecture](#architecture) · 2. [Tech stack](#tech-stack) · 3. [Install & run](#install--run) · 4. [Environment variables](#environment-variables)
5. [Database](#database) · 6. [Demo data](#demo-data) · 7. [Registration & roles](#registration--roles) · 8. [Data import](#data-import)
9. [Risk engine (DSRS)](#risk-engine-dsrs) · 10. [Forecasting](#forecasting) · 11. [Simulator](#what-if-simulator) · 12. [Reports](#reports)
13. [Security](#security) · 14. [Testing](#testing) · 15. [Production deployment](#production-deployment) · 16. [Known limitations](#known-limitations-read-this)

---

## Architecture

```
frontend/ (React 18 + Vite + Tailwind)          backend/ (Flask 3 + SQLAlchemy)
  pages/ components/ context/ api/                app.py          app factory, CORS, security headers, error handling
        │  REST + JWT, {success,data|message}     config.py       env-driven configuration
        ▼                                         models.py       multi-tenant schema
  /api/*  ───────────────────────────────────►    utils.py        auth decorator, RBAC, tenant scoping, rate limit, audit
                                                  routes/         auth, workspace(+users, audit, notifications), operations,
                                                                  imports, analytics, reports
                                                  services/       importer, import_fields, dsrs, forecast, simulator,
                                                                  recommendations, analytics, reports, chatbot, demo_data
```

**Tenant isolation.** Every business table (`products`, `sales`, `purchases`, `suppliers`, `inventory_transactions`,
`risk_analysis`, `import_jobs`, `notifications`, `audit_logs`, …) has a `workspace_id` foreign key. The `@require(permission)`
decorator derives the user *and* workspace from the signed token + database (never from request parameters), and all reads go
through `scoped(Model)` / `get_scoped(Model, id)`. A foreign id looks exactly like a missing id (HTTP 404). This is covered by
`test_tenant_isolation`.

**API contract.** Success: `{"success": true, "data": …}`. Failure: `{"success": false, "message": "Readable message"}`.
Technical errors are logged on the server only; users see a plain message.

### Tables
`workspaces`, `users` (role per user), `invites`, `password_resets`, `token_blocklist`, `suppliers`, `products`, `purchases`, `sales`,
`inventory_transactions` (stock ledger), `risk_analysis` (latest DSRS + movement + forecast per product), `import_jobs`
(= uploaded datasets / import history), `notifications`, `audit_logs`. Workspace settings (business type, risk thresholds/weights)
live in `workspaces.risk_config`. Recommendations and reports are computed on demand from `risk_analysis`, not stored.

## Tech stack
Python 3.10+, Flask 3, Flask-SQLAlchemy, Flask-JWT-Extended, Flask-CORS, openpyxl/xlrd (Excel), ReportLab (PDF), SQLite (default) or PostgreSQL ·
React 18, React Router 6, Tailwind CSS, Chart.js, Vite 5 (IBM Plex Sans is bundled — no third-party font requests).

## Install & run

**Prerequisites:** Python 3.10+, Node.js 18+, npm.

```bash
# 1. backend
cd backend
python3 -m venv .venv && source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env                                      # Windows: copy .env.example .env
python seed.py                                            # optional: creates ONLY the shared Demo Workspace
python app.py                                             # API on http://localhost:5000

# 2. frontend (second terminal)
cd frontend
npm install
npm run dev                                               # UI on http://localhost:5173
```
Shortcuts: `./start-backend.sh`, `./start-frontend.sh` (or the `.bat` files), and from the repo root `npm run seed`,
`npm run backend`, `npm run frontend`, `npm run build`, `npm test`.

Open http://localhost:5173 → **Get started** → register. Tables are created automatically on first start.

## Environment variables
See `backend/.env.example` (copy to `backend/.env`; never commit it).

| Variable | Purpose |
|---|---|
| `APP_ENV` | `development` or `production`. Production **requires** `JWT_SECRET` (≥ 32 chars) and disables the debugger |
| `DATABASE_URL` | Empty = SQLite at `database/stockghost.db`. PostgreSQL: `postgresql://user:pw@host/db` (+ `pip install psycopg2-binary`) |
| `JWT_SECRET`, `JWT_EXPIRES_IN` | Token signing secret and lifetime (`30m`, `8h`, `7d`) |
| `CLIENT_URL` | Allowed CORS origin(s), comma-separated |
| `PORT` | API port (default 5000) |
| `UPLOAD_LIMIT` (MB), `UPLOAD_DIR`, `MAX_IMPORT_ROWS`, `MAX_IMPORT_COLUMNS` | Upload limits |
| `SMTP_*`, `EMAIL_FROM` | Password-reset e-mail. Without SMTP the link is written to the server log |
| `TRUST_PROXY` | `1` only behind a trusted reverse proxy |
| `VITE_API_URL` (frontend `.env`) | Only if the UI and API are on different origins |

## Database
Schema is created with `db.create_all()` at start-up. **There is no migration tool yet:** the schema changed substantially from the
original prototype, so the old `stockghost.db` was removed — start from a fresh database. For future schema changes add Alembic
(`flask-migrate`) before storing production data. Indexes exist on `workspace_id`, sale/purchase dates and (workspace, product) pairs.

## Demo data
* `python seed.py` (or `npm run seed`) creates **one** workspace, *Demo Workspace (sample data)*, flagged `is_shared_demo`
  (100 products, 10 suppliers, ≈4,500 sales). `python seed.py --reset` rebuilds only that workspace. It never touches real workspaces.
* The login page has an **Explore the read-only demo workspace** button (read-only viewer access, no credentials shown). Everything in a demo workspace
  shows a **DEMO DATA** badge.
* During onboarding a new company can choose **Explore demo data**, which copies the sample catalogue into *their own* workspace
  (writable, labelled DEMO DATA). Importing real data later asks for confirmation and **removes the sample data first**, so demo and real
  numbers are never mixed.
* For testing only, the seed also creates `admin@stockghost.com`, `inventory@stockghost.com`, `sales@stockghost.com`
  (password `Demo@12345`) inside the demo workspace.

## Registration & roles
Public registration creates a **user + workspace + OWNER** role and signs the user in. Passwords: ≥ 8 characters with upper-case,
lower-case and a digit, hashed with Werkzeug (scrypt). 5 failed logins lock the account for 15 minutes; login/registration/reset are
rate-limited. Forgot/reset password uses one-time, 1-hour tokens (stored hashed). Teammates join via **Users → Invite** (7-day code) or
are created directly by an owner/admin.

| Role | Can |
|---|---|
| OWNER | everything (incl. deleting all business data) |
| ADMIN | everything except owner-only actions and creating/changing owners |
| INVENTORY_MANAGER | products, inventory, suppliers, purchases, import data, run analysis, read sales/analytics/reports |
| SALES_MANAGER | sales, import **sales** data, read products/inventory/analytics/reports |
| ANALYST | read everything, run analysis, risk/forecasting/reports |
| VIEWER | read-only dashboards, analytics, reports |

Permissions are enforced by the API (`403`), not just by hiding buttons.

## Data import
**Import Data** (`/data-import`) is a 4-step wizard (also used in onboarding): **Upload → Map columns → Validate & clean → Import**.
History, details, *Reprocess*, *Delete import* and the error-report download are on **Import history** (`/data-sources`).

**Accepted files:** `.csv` (UTF-8/Windows-1252, `, ; tab |` delimiters), `.xlsx`, `.xls` (first sheet with data). Defaults: 25 MB,
200,000 rows, 60 columns. Uploads are checked for extension, MIME type, file signature, size, rows and columns, saved under a random name
outside the web root, and never executed.

**Dataset types and fields** (`*` required; download a header template from the wizard):

| Type | Fields |
|---|---|
| Product master | `sku*`, `product_name*`, category, cost_price, selling_price, quantity, reorder_level, supplier, warehouse, expiry_date, status |
| Inventory | `sku*`, `quantity*`, product_name, category, cost/selling price, reorder_level, warehouse, supplier, last_received_date, expiry_date |
| Sales | `sale_date*`, `quantity*`, `sku` *or* `product_name`, selling_price, category, customer, region, order_id |
| Purchases | `purchase_date*`, `quantity*`, `sku` *or* `product_name`, cost_price, supplier, order_id, received_date |
| Suppliers | `supplier*`, contact, email, phone, lead_time_days |
| Combined | sku/product_name, category, prices, current_stock, reorder_level, supplier, warehouse, region, customer, order_id, `transaction_type` (sale/purchase), `transaction_date`, `transaction_quantity` |

**Column mapping.** Your headers need not match. Headers are matched by alias and fuzzy similarity (`Item Code→sku`, `Qty Sold→quantity`,
`Sale Date→sale_date`, `Price→selling_price`, `MRP→selling_price`, `Vendor→supplier` …); you can correct any mapping and required fields are
shown with ✓/✕.

**Validation & cleaning.** Detected and reported with row numbers: missing required values, invalid/future dates, invalid numbers,
negative or zero quantities, negative prices, missing SKU, unknown products, exact duplicate rows, duplicate SKUs, inconsistent names,
decimal quantities, quantity outliers (IQR). Always-on, *logged* cleaning: trimming, SKU upper-casing, currency symbols/commas removed,
date normalisation (day-first by default, auto-detects month-first). Optional: *Fix automatically*, *Remove duplicates*, *Exclude outliers*.
Rejected rows are **never silently dropped** — they are counted and downloadable as an error report. The import is a single database
transaction: if anything fails nothing is written.

**How imported history affects stock.** *Product/Inventory* files set the current stock (a snapshot). *Sales/Purchases* files are treated as
**history** and do **not** change a snapshot quantity (otherwise you would double count). If a product has no snapshot, its stock is derived as
purchases − sales. Manual sales/purchases entered in the UI do change stock and write to the stock ledger.
Stock age needs purchase or `last_received_date` data; when it is missing, that factor is excluded (shown as "no data") rather than guessed.

## Risk engine (DSRS)
Rule-based and transparent — **not machine learning**. Score 0–100 = weighted blend of normalised factors:
stock age, days since last sale, sales velocity/cover, inventory value, quantity vs reorder level, demand trend (last 45 days vs prior 45),
plus **seasonality** (Fashion) and **expiry** (Grocery, when expiry dates exist). Missing factors are dropped and the rest re-weighted.
Levels: **LOW** 0–30, **MEDIUM** 31–60, **HIGH** 61–80, **CRITICAL** 81–100. *Blocked capital* = qty × cost for products above the threshold
(default 60). Every product shows its score *and the reasons* (e.g. "No sale for 183 days · ₹7.50 L held · 500 units = 10× reorder level").

Separately, each product gets a stock status: Dead Stock, Slow Moving, Healthy, Fast Moving, Overstock, Stockout Risk.
Business-type profiles (Retail, E-commerce, Wholesale, Manufacturing, Electronics, Fashion, Grocery, Furniture, Other) set weights and time
scales; thresholds and weights can be edited per workspace in **Settings**. *Analysis date* can be "today" or "latest date in the data"
(useful when testing with old files).

## Forecasting
**Statistical forecasting, not ML.** Weekly demand per product is forecast with moving average, exponential smoothing or damped Holt trend;
the method with the lowest error (WAPE) on a hold-out of the most recent weeks wins — the hold-out is excluded from fitting while scoring
(no leakage) and the winner is then refitted on all data. The UI shows method, backtest accuracy and a range. With < 8 weeks of history or
< 3 selling weeks it falls back to average daily velocity and says "limited data". Outputs: expected demand, expected stock, potential stock-out
and overstock. No machine-learning model is trained; see [limitations](#known-limitations-read-this).

## What-if simulator
Single product or group (blocked products, top dead stock, a category, everything): discount %, demand change %, purchase quantity (single product),
forecast period, price sensitivity. Shows current vs projected blocked capital, sales, units, capital recovered and DSRS plus a discount curve.
The projection changes only the *stock position*; historical demand signals (days since last sale, 90-day units, trend) are held fixed, because a one-off discount is not evidence that demand recovered. All results are labelled **projections**; the assumption (sell-through lift = sensitivity × discount, default 2.8, from the original model) is shown
and editable.

## Reports
Inventory, Dead stock, Risk, Sales, Purchases, Blocked capital, Recommendations, Executive summary — as on-screen preview, **CSV**, **Excel** or
**PDF** (company, period, generated date, KPIs, chart, top-risk products, recommendations). PDFs use "Rs" because standard PDF fonts lack the ₹ glyph.
CSV/Excel cells are neutralised against spreadsheet-formula injection.

## Security
Password hashing · JWT secret from env (required in production) · token revocation on logout and invalidation after password change ·
workspace + role checks on every endpoint · restricted CORS · rate limiting and account lockout · upload validation · parameterised queries (SQLAlchemy) ·
React auto-escaping (no `dangerouslySetInnerHTML`) · security headers · generic user-facing errors, details only in server logs · business data is never
sent to third parties (no external fonts, analytics or AI services).

## Testing
```bash
cd backend && pip install pytest && python -m pytest tests -q        # 16 end-to-end API tests, temporary database
```
Covers registration/password rules, login/logout/lockout, reset flow, empty workspace, CSV + Excel import, mapping/validation/cleaning, malicious uploads,
**tenant isolation (user A cannot read/modify user B's data)**, every role, product/inventory/sales/purchase CRUD, demo replace flow, simulator, all
8 reports × CSV/XLSX/PDF, delete-import, read-only shared demo.
`e2e/e2e_ui.py` is a Playwright browser script (`pip install playwright && playwright install chromium`) that registers a user and drives onboarding → import → dashboard → every route. Run it against the running app with a built UI: `SG_URL=http://localhost:5000 SG_EMAIL=new-user@example.test python e2e/e2e_ui.py` (use a new e-mail each run).
start the app with the built UI first). `sample_data/` contains example files with non-standard headers for trying the mapping step.

## Production deployment
```bash
npm --prefix frontend run build                       # creates frontend/dist, served by Flask automatically
cd backend
export APP_ENV=production JWT_SECRET="$(python -c 'import secrets;print(secrets.token_urlsafe(48))')"
export DATABASE_URL=postgresql://user:pw@db/stockghost CLIENT_URL=https://app.example.com UPLOAD_DIR=/var/lib/stockghost/uploads
pip install gunicorn psycopg2-binary
gunicorn -w 2 --timeout 180 -b 127.0.0.1:8000 'app:create_app()'
```
Put it behind HTTPS (nginx/Caddy), set `TRUST_PROXY=1` only if the proxy sets `X-Forwarded-For`, back up the database and `UPLOAD_DIR`, and use PostgreSQL for
more than a handful of concurrent users. `--timeout 180` matters because imports run synchronously.

## Known limitations (read this)
* **No machine learning.** Forecasting is statistical and DSRS is rule-based, and both are labelled that way. An ML model was deliberately not added: per-product
  histories in typical uploads are too short to train and validate one honestly.
* **Forecasting has no seasonal model** (only the DSRS seasonality factor, which needs ≥ 12 months of sales). Confidence is a hold-out WAPE, not a prediction guarantee.
* **Multiple warehouses are a label** (filter/grouping on `warehouse`), not separate stock per location; **stock transfers** are not implemented. No external integrations.
* **Imports are synchronous** (fine to ~200k rows in seconds–tens of seconds); for larger volumes add a job queue.
* **In-memory rate limiting** is per process; use a shared store (Redis) with several workers.
* Auth token is kept in `localStorage` (XSS-safe rendering mitigates, but httpOnly cookies + CSRF protection would be stronger).
* One workspace per user; no tenant-level billing or SSO. No Alembic migrations yet (see [Database](#database)).
* Recommendation effects are *estimates* from a documented model, not measured outcomes.
