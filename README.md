# StockGhost — Dead Stock & Blocked Capital Detection ERP

---

## 📌 Executive Summary & Problem Statement

Traditional ERP and inventory systems show stock quantities on hand but fail to systematically identify the financial drag caused by slow-moving and dead stock. Non-performing inventory quietly blocks operating capital and inflates storage/holding costs.

**Real-World Scenario (from Project Spec):**
A business has an inventory of **500 units of a Gaming Keyboard** with no recorded sales in **180+ days** and a stock age of **210 days**. At a cost price of ₹1,500/unit, an inventory value of **₹7,50,000** shows up as normal inventory on hand rather than as **blocked capital**.

**StockGhost** solves this by:
1. Computing a **Dead Stock Risk Score (DSRS)** from `0 to 100` for every SKU.
2. Classifying items into 4 tiers: **Healthy**, **Slow Moving**, **High Risk**, and **Dead Stock**.
3. Accurately quantifying **Blocked Capital** tied up in non-performing assets.
4. Providing a **Clearance Simulator** to test price elasticity and discount scenarios (e.g. 25% clearance discount recovering ₹5,25,000 and dropping DSRS from 92 to 38).
5. Generating **Rule-Based Recovery Recommendations** (Discounts, Bundling, Liquidation, RMA Supplier Return).
6. Offering an **Intent-Based Conversational Chatbot** for natural-language queries.
7. Providing a **Role-Based Web Dashboard** for Admins, Inventory Managers, and Sales Managers.

---

## 🛠️ Technology Stack (As Per Slide 7)

| Layer | Technology |
|---|---|
| **Frontend** | React.js (Vite), Tailwind CSS, Axios, Chart.js (`react-chartjs-2`), Lucide Icons |
| **Backend** | Python (Flask, Flask-CORS, Flask-JWT-Extended, Flask-SQLAlchemy) |
| **Database** | SQLite (zero-config local default) / MySQL (via SQLAlchemy connection string) |
| **Risk Algorithm** | Python (**DSRS Algorithm** with 4-factor weighted scoring) |
| **Recommendation Engine** | Python (**Rule-Based Engine** for clearance, bundling, and returns) |
| **Chatbot** | Python (**Intent-Based Natural Language Query Engine**) |
| **Authentication** | JWT + Role-Based Access Control (**Admin**, **Inventory Manager**, **Sales Manager**) |
| **Version Control** | Git & GitHub |

---

## 📐 Mathematical Formulation: Dead Stock Risk Score (DSRS)

The DSRS engine evaluates inventory health across 4 normalized dimensions:

$$\text{DSRS} = (S_{\text{inactivity}} \times 0.40) + (S_{\text{stagnancy}} \times 0.30) + (S_{\text{capital}} \times 0.20) + (S_{\text{obsolescence}} \times 0.10)$$

### 1. Inactivity Score ($S_{\text{inactivity}}$) — Weight: 40%
Evaluates days elapsed since the last customer purchase ($D_{\text{last}}$):
- $D_{\text{last}} \ge 180\text{ days}$: $\min(100, 90 + (D_{\text{last}} - 180) \times 0.33)$
- $90 \le D_{\text{last}} < 180\text{ days}$: $65 + (D_{\text{last}} - 90) \times \frac{25}{90}$
- $45 \le D_{\text{last}} < 90\text{ days}$: $35 + (D_{\text{last}} - 45) \times \frac{30}{45}$
- $D_{\text{last}} < 45\text{ days}$: $\frac{D_{\text{last}}}{45} \times 35$

### 2. Turnover Stagnancy Score ($S_{\text{stagnancy}}$) — Weight: 30%
Evaluates inventory velocity and months of supply remaining relative to 90-day moving sales. If zero sales occur in 90+ days, score escalates to 80–95.

### 3. Capital Exposure Score ($S_{\text{capital}}$) — Weight: 20%
Quantifies financial strain based on total rupee capital tied up in the SKU ($V = Q \times C$):
- $V \ge ₹7,50,000$: Score 80 – 100
- $V \ge ₹3,00,000$: Score 60 – 80
- $V < ₹3,00,000$: Pro-rated up to 60

### 4. Category Obsolescence Factor ($S_{\text{obsolescence}}$) — Weight: 10%
Category-specific multiplier accounting for technological depreciation (e.g. computer peripherals = 1.1x, monitors = 1.2x).

### 🏷️ Classification Tiers

| Score Range | Tier Classification | Capital Status | Prescriptive Action |
|---|---|---|---|
| **0 – 30** | **Healthy** | Active Capital | Normal replenishment cycle |
| **31 – 60** | **Slow Moving** | Watchlist | Halt reorders, apply homepage promo |
| **61 – 80** | **High Risk** | Blocked Capital | Bundle with best sellers, 15-20% weekend promo |
| **81 – 100** | **Dead Stock** | Blocked Capital | 25-35% Clearance sale, Supplier RMA, or Liquidation |

---

## 🎯 Verification of Slide 4 & 9 Benchmark Example

| Metric | Slide Specification | StockGhost Implementation | Verification Status |
|---|---|---|---|
| **Product** | Gaming Keyboard | RGB Mechanical Gaming Keyboard (`KB-MECH-RGB-01`) | ✅ Exact Match |
| **Stock on Hand** | 500 units | 500 units | ✅ Exact Match |
| **Stock Age** | 210 days | 210 days | ✅ Exact Match |
| **Last Sale Inactivity** | No sale in 180+ days | 185 days since last sale | ✅ Exact Match |
| **Cost Price / Value** | ₹1,500 / ₹7,50,000 | ₹1,500 cost / ₹7,50,000 inventory value | ✅ Exact Match |
| **Original DSRS** | **92 (Dead Stock)** | **92 (Dead Stock)** | ✅ Exact Match |
| **Clearance Discount** | 25% discount | 25% discount applied | ✅ Exact Match |
| **Units Cleared** | ~350 of 500 units | **350 units sold** | ✅ Exact Match |
| **Capital Recovered** | ₹5,25,000 | **₹5,25,000** ($350 \times ₹1,500$) | ✅ Exact Match |
| **Projected DSRS** | **Drops from 92 to 38** | **38 (Slow Moving tier)** | ✅ Exact Match |

---

## 🚀 How to Run the Project

### Prerequisites
- **Python 3.9+**
- **Node.js 18+** and **npm**

### Option A: 1-Click Launch (Windows)
Double-click `start_all.bat` in the project root:
- Automatically installs python packages & node dependencies if needed.
- Starts the Flask API on `http://127.0.0.1:5000`.
- Starts the React Vite dashboard on `http://localhost:5173`.

### Option B: Manual Terminal Execution

#### 1. Start Flask Backend:
```bash
cd backend
pip install -r requirements.txt
python app.py
```
*API will start on `http://127.0.0.1:5000` with pre-seeded database.*

#### 2. Start React Frontend:
```bash
cd frontend
npm install
npm run dev
```
*Frontend will run on `http://localhost:5173`.*

---

## 🔑 Demo Access & Role-Based Access Control (RBAC)

The system includes pre-configured demo credentials and a **one-click Role Switcher** right in the top navigation bar:

| Role | Username | Email | Password | Permissions |
|---|---|---|---|---|
| **Admin** | `admin` | `admin@stockghost.com` | `admin123` | Full access: View analytics, edit all products, re-evaluate recommendations, manage system users |
| **Inventory Manager** | `inventory_mgr` | `inventory@stockghost.com` | `inv123` | Inward PO creation, catalog editing, stock adjustments, RMA initiation |
| **Sales Manager** | `sales_mgr` | `sales@stockghost.com` | `sales123` | Sales ledger entry, clearance simulation execution, promotional discounts |

---

## 🤖 Intent-Based Chatbot Queries

The embedded AI assistant can be tested using queries such as:
- *"Which product blocks the most capital?"*
- *"What is the total blocked capital across inventory?"*
- *"Show me all dead stock items"*
- *"What corrective action to take for Gaming Keyboard?"*
- *"Simulate 25% discount on Gaming Keyboard"*
- *"Give me an inventory overview"*

---

## 📂 Project Directory Structure

```
stockghost/
├── README.md                  # Project documentation & thesis summary
├── start_all.bat              # 1-Click concurrent launcher
├── run_backend.bat            # Backend runner script
├── run_frontend.bat           # Frontend runner script
├── backend/
│   ├── app.py                 # Flask server & CORS setup
│   ├── config.py              # Configuration (SQLite / MySQL)
│   ├── database.py            # SQLAlchemy initialization
│   ├── models.py              # Products, Categories, Suppliers, POs, Sales, Recommendations
│   ├── seed_data.py           # Pre-seeded sample dataset including Gaming Keyboard
│   ├── requirements.txt       # Python dependencies
│   ├── algorithms/
│   │   ├── dsrs.py            # Dead Stock Risk Score mathematical algorithm
│   │   ├── recommendation.py  # Rule-based prescriptive recovery engine
│   │   └── simulator.py       # Clearance discount & capital recovery simulator
│   ├── chatbot/
│   │   └── intent_engine.py   # Intent-based conversational assistant
│   └── routes/
│       ├── auth_routes.py     # JWT login, registration & RBAC
│       ├── inventory_routes.py# Product CRUD & stock tracking
│       ├── analytics_routes.py# KPI aggregation & Chart.js data
│       ├── simulation_routes.py# Simulator API
│       ├── recommendation_routes.py # Recovery actions API
│       └── chatbot_routes.py  # Conversational query endpoint
└── frontend/
    ├── package.json           # React dependencies
    ├── vite.config.js         # Vite configuration with proxy
    ├── tailwind.config.js     # Tailwind design system with risk color tiers
    ├── index.html             # Entry HTML
    └── src/
        ├── App.jsx            # Main app router & tab layout
        ├── main.jsx           # React DOM root
        ├── api.js             # Axios client with JWT interceptor
        ├── context/
        │   └── AuthContext.jsx# RBAC authentication state & role switcher
        ├── components/
        │   ├── Navbar.jsx     # Header with role switcher & college branding
        │   ├── Sidebar.jsx    # ERP module navigation
        │   ├── StatCard.jsx   # KPI metric card
        │   ├── RiskBadge.jsx  # Color-coded tier badges
        │   └── AddProductModal.jsx # New SKU entry modal
        └── pages/
            ├── Dashboard.jsx  # Chart.js analytics & blocked capital alerts
            ├── Inventory.jsx  # Catalog table, filters & CSV export
            ├── DSRSMeta.jsx   # DSRS algorithm formulas & live sandbox
            ├── Simulator.jsx  # Interactive Clearance What-If simulator
            ├── Recommendations.jsx # Prescriptive recovery actions
            ├── Transactions.jsx # Purchase orders & sales ledger
            ├── ChatbotPage.jsx# Natural-language inventory assistant
            └── Login.jsx      # Authentication & demo roles
```

---

## 📜 Department & University Reference
- **Institution:** Lokmanya Tilak Jankalyan Shikshan Sanstha's Priyadarshini College of Engineering, Nagpur
- **Affiliation:** Rashtrasant Tukadoji Maharaj Nagpur University (R.T.M.N.U.)
- **Department:** Department of Information Technology
- **Project Topic:** StockGhost — Dead Stock & Blocked Capital Detection
