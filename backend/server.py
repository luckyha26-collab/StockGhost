import os
import sys
import json
from datetime import datetime, date, timedelta
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

# Import algorithms (pure standard Python, zero external dependencies!)
sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))
from algorithms.dsrs import calculate_dsrs
from algorithms.recommendation import generate_recommendations
from algorithms.simulator import simulate_clearance

PORT = int(os.environ.get("PORT", 5050))

# In-memory storage seeded with slide benchmark data
CATEGORIES = [
  {"id": 1, "name": "Peripherals & Input", "description": "Keyboards, mice, and controllers", "holding_cost_rate": 0.18, "obsolescence_factor": 1.1},
  {"id": 2, "name": "Ergonomic Furniture", "description": "Office chairs and sit-stand desks", "holding_cost_rate": 0.22, "obsolescence_factor": 0.9},
  {"id": 3, "name": "Monitors & Displays", "description": "High-resolution screens and panels", "holding_cost_rate": 0.15, "obsolescence_factor": 1.2},
  {"id": 4, "name": "Cables & Accessories", "description": "USB-C hubs, stands, and adapters", "holding_cost_rate": 0.12, "obsolescence_factor": 0.8},
  {"id": 5, "name": "Audio Equipment", "description": "Headsets and wireless earbuds", "holding_cost_rate": 0.16, "obsolescence_factor": 1.0},
]

SUPPLIERS = [
  {"id": 1, "name": "Apex Peripherals Ltd.", "contact_person": "Rajesh Sharma", "email": "rajesh@apexperipherals.in", "phone": "+91 98230 11223", "address": "Bhiwandi Logistics Hub, Maharashtra", "return_policy": "30-day RMA with 10% restock fee"},
  {"id": 2, "name": "ErgoTech Works India", "contact_person": "Sunil Verma", "email": "sunil@ergotech.co.in", "phone": "+91 94221 44556", "address": "Industrial Area, Pune", "return_policy": "Return on damaged goods only"},
  {"id": 3, "name": "Nova Display Systems", "contact_person": "Priya Patel", "email": "priya@novadisplay.com", "phone": "+91 99300 77889", "address": "Electronic City, Bengaluru", "return_policy": "45-day manufacturer exchange"},
]

class MockProduct:
    def __init__(self, id, sku, name, description, category_id, supplier_id, cost_price, selling_price, current_stock, min_stock, first_received_days_ago, last_sale_days_ago):
        today = date.today()
        self.id = id
        self.sku = sku
        self.name = name
        self.description = description
        self.category_id = category_id
        self.supplier_id = supplier_id
        self.cost_price = cost_price
        self.selling_price = selling_price
        self.current_stock = current_stock
        self.min_stock = min_stock
        self.warehouse_location = "Main Bay A-01"
        self.first_received_date = today - timedelta(days=first_received_days_ago)
        self.last_sale_date = today - timedelta(days=last_sale_days_ago) if last_sale_days_ago is not None else None
        self.sales = []

    def to_dict(self):
        cat = next((c["name"] for c in CATEGORIES if c["id"] == self.category_id), "General")
        sup = next((s["name"] for s in SUPPLIERS if s["id"] == self.supplier_id), "N/A")
        dsrs_info = calculate_dsrs(self)
        return {
            "id": self.id,
            "sku": self.sku,
            "name": self.name,
            "description": self.description,
            "category_id": self.category_id,
            "category_name": cat,
            "supplier_id": self.supplier_id,
            "supplier_name": sup,
            "cost_price": float(self.cost_price),
            "selling_price": float(self.selling_price),
            "current_stock": int(self.current_stock),
            "min_stock": int(self.min_stock),
            "warehouse_location": self.warehouse_location,
            "stock_age_days": dsrs_info["stock_age_days"],
            "days_since_last_sale": dsrs_info["days_since_last_sale"],
            "total_inventory_value": float(self.cost_price * self.current_stock),
            "dsrs": dsrs_info
        }

PRODUCTS = []
SALES = []
PURCHASES = []
RECOMMENDATIONS = []

SYSTEM_AUDIT_TRAIL = [
    {
        "id": 1,
        "timestamp": datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S"),
        "action": "SYSTEM_INITIALIZE",
        "details": "StockGhost ERP initialized in Role-Based Access mode. Awaiting business catalog / CSV import.",
        "destination": "StockGhost Enterprise Core",
        "user_id": "system",
        "role": "System",
        "department": "Enterprise Administration",
        "status": "READY"
    }
]

class StockGhostHandler(BaseHTTPRequestHandler):
    def _set_headers(self, status=200):
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        self.end_headers()

    def do_OPTIONS(self):
        self._set_headers(200)

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path.rstrip('/')

        if path == '/api/health' or path == '/health':
            self._set_headers(200)
            self.wfile.write(json.dumps({
                "status": "healthy",
                "system": "StockGhost ERP - Dead Stock & Blocked Capital Detection",
                "version": "1.0.0",
                "port": PORT
            }).encode('utf-8'))
            return

        if path == '/api/products':
            prods = [p.to_dict() for p in PRODUCTS]
            self._set_headers(200)
            self.wfile.write(json.dumps(prods).encode('utf-8'))
            return

        if path == '/api/categories':
            self._set_headers(200)
            self.wfile.write(json.dumps(CATEGORIES).encode('utf-8'))
            return

        if path == '/api/suppliers':
            self._set_headers(200)
            self.wfile.write(json.dumps(SUPPLIERS).encode('utf-8'))
            return

        if path == '/api/sales':
            self._set_headers(200)
            self.wfile.write(json.dumps(SALES).encode('utf-8'))
            return

        if path == '/api/purchases':
            self._set_headers(200)
            self.wfile.write(json.dumps(PURCHASES).encode('utf-8'))
            return

        if path == '/api/recommendations':
            self._set_headers(200)
            self.wfile.write(json.dumps(RECOMMENDATIONS).encode('utf-8'))
            return

        if path == '/api/analytics/dashboard':
            total_val = sum(p.current_stock * p.cost_price for p in PRODUCTS)
            total_blocked = sum((p.current_stock * p.cost_price) for p in PRODUCTS if calculate_dsrs(p)["is_blocked"])
            tier_counts = {"Healthy": 0, "Slow Moving": 0, "High Risk": 0, "Dead Stock": 0}
            total_score = 0
            for p in PRODUCTS:
                t = calculate_dsrs(p)["tier"]
                tier_counts[t] += 1
                total_score += calculate_dsrs(p)["score"]
            avg_dsrs = round(total_score / len(PRODUCTS), 1) if PRODUCTS else 0
            blocked_pct = round((total_blocked / total_val * 100), 1) if total_val else 0

            res = {
                "total_inventory_value": total_val,
                "total_blocked_capital": total_blocked,
                "blocked_capital_percent": blocked_pct,
                "total_skus": len(PRODUCTS),
                "average_dsrs": avg_dsrs,
                "tier_counts": tier_counts,
                "top_risky_products": [p.to_dict() for p in sorted(PRODUCTS, key=lambda x: (1 if calculate_dsrs(x)["is_blocked"] else 0, x.current_stock * x.cost_price), reverse=True)[:6]]
            }
            self._set_headers(200)
            self.wfile.write(json.dumps(res).encode('utf-8'))
            return

        if path == '/api/analytics/category-breakdown':
            data = []
            for cat in CATEGORIES:
                cat_prods = [p for p in PRODUCTS if p.category_id == cat["id"]]
                v = sum(p.current_stock * p.cost_price for p in cat_prods)
                b = sum(p.current_stock * p.cost_price for p in cat_prods if calculate_dsrs(p)["is_blocked"])
                d = sum(1 for p in cat_prods if calculate_dsrs(p)["tier"] == "Dead Stock")
                data.append({"category_id": cat["id"], "category_name": cat["name"], "total_value": v, "blocked_capital": b, "dead_stock_items": d})
            self._set_headers(200)
            self.wfile.write(json.dumps(data).encode('utf-8'))
            return

        if path == '/api/auth/users':
            if not hasattr(StockGhostHandler, 'USERS'):
                StockGhostHandler.USERS = {
                    "admin": {"id": 1, "username": "admin", "full_name": "System Administrator", "password": "admin123", "role": "Admin", "phone": "+91 9823924993", "email": "admin@stockghost.com"},
                    "sales_mgr": {"id": 2, "username": "sales_mgr", "full_name": "Sales & Clearance Manager", "password": "sales123", "role": "Sales Manager", "phone": "+91 9823924993", "email": "sales@stockghost.com"},
                    "inventory_mgr": {"id": 3, "username": "inventory_mgr", "full_name": "Inventory Head", "password": "inv123", "role": "Inventory Manager", "phone": "+91 9823924993", "email": "inventory@stockghost.com"},
                }
            users_list = []
            for u in StockGhostHandler.USERS.values():
                users_list.append({
                    "id": u["id"],
                    "username": u["username"],
                    "full_name": u.get("full_name", u["username"]),
                    "role": u["role"],
                    "phone": u.get("phone", ""),
                    "phone_masked": (u.get("phone", "")[:3] + "****" + u.get("phone", "")[-3:]) if len(u.get("phone", "")) >= 8 else "****"
                })
            self._set_headers(200)
            self.wfile.write(json.dumps(users_list).encode('utf-8'))
            return

        if path == '/api/audit-trail':
            self._set_headers(200)
            self.wfile.write(json.dumps(SYSTEM_AUDIT_TRAIL).encode('utf-8'))
            return

        # Serve ERP web application on root routes
        if path in ('', '/index.html', '/app', '/stockghost', '/stockghost_app.html'):
            html_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "index.html")
            if os.path.exists(html_path):
                self.send_response(200)
                self.send_header('Content-Type', 'text/html; charset=utf-8')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                with open(html_path, 'rb') as f:
                    self.wfile.write(f.read())
                return

        # Default fallback
        self._set_headers(200)
        self.wfile.write(json.dumps({
            "message": "StockGhost Core API running on port 5050",
            "api_health": "/api/health"
        }).encode('utf-8'))
        return

    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path.rstrip('/')
        content_length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(content_length).decode('utf-8') if content_length > 0 else '{}'
        try:
            data = json.loads(body)
        except Exception:
            data = {}

        # User store for server.py
        if not hasattr(StockGhostHandler, 'USERS'):
            StockGhostHandler.USERS = {
                "admin": {"id": 1, "username": "admin", "full_name": "System Administrator", "password": "admin123", "role": "Admin", "email": "admin@stockghost.com"},
                "sales_mgr": {"id": 2, "username": "sales_mgr", "full_name": "Sales & Clearance Manager", "password": "sales123", "role": "Sales Manager", "email": "sales@stockghost.com"},
                "inventory_mgr": {"id": 3, "username": "inventory_mgr", "full_name": "Inventory Head", "password": "inv123", "role": "Inventory Manager", "email": "inventory@stockghost.com"},
            }

        if path == '/api/auth/register':
            u = (data.get('username') or '').strip().lower()
            p = (data.get('password') or '').strip()
            role = data.get('role', 'Inventory Manager')
            fn = data.get('full_name') or u
            email = data.get('email') or f"{u}@stockghost.com"
            if not u or not p:
                self._set_headers(400)
                self.wfile.write(json.dumps({"error": "User ID and password are required for provisioning."}).encode('utf-8'))
                return

            if not hasattr(StockGhostHandler, 'USERS'):
                StockGhostHandler.USERS = {
                    "admin": {"id": 1, "username": "admin", "full_name": "System Administrator", "password": "admin123", "role": "Admin", "email": "admin@stockghost.com"},
                    "sales_mgr": {"id": 2, "username": "sales_mgr", "full_name": "Sales & Clearance Lead", "password": "sales123", "role": "Sales Manager", "email": "sales@stockghost.com"},
                    "inventory_mgr": {"id": 3, "username": "inventory_mgr", "full_name": "Inventory Head", "password": "inv123", "role": "Inventory Manager", "email": "inventory@stockghost.com"},
                }

            StockGhostHandler.USERS[u] = {
                "id": len(StockGhostHandler.USERS) + 1,
                "username": u,
                "full_name": fn,
                "password": p,
                "role": role,
                "email": email
            }

            SYSTEM_AUDIT_TRAIL.insert(0, {
                "id": len(SYSTEM_AUDIT_TRAIL) + 1,
                "timestamp": datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S"),
                "action": "ADMIN_REGISTRATION",
                "details": f"Admin provisioned manager account '{u}' ({fn}) with role '{role}'",
                "destination": "RBAC Security Directory / Enterprise Org",
                "user_id": data.get("registered_by", "admin"),
                "role": "Admin",
                "department": "Enterprise Security",
                "status": "REGISTERED"
            })

            self._set_headers(201)
            self.wfile.write(json.dumps({
                "message": f"Account '{u}' provisioned successfully with role '{role}'.",
                "user": {"username": u, "role": role, "email": email}
            }).encode('utf-8'))
            return

        if path == '/api/auth/reset-password':
            u = (data.get('username') or '').strip().lower()
            new_pass = (data.get('new_password') or data.get('password') or '').strip()
            if not hasattr(StockGhostHandler, 'USERS'):
                StockGhostHandler.USERS = {
                    "admin": {"id": 1, "username": "admin", "full_name": "System Administrator", "password": "admin123", "role": "Admin", "email": "admin@stockghost.com"},
                    "sales_mgr": {"id": 2, "username": "sales_mgr", "full_name": "Sales & Clearance Lead", "password": "sales123", "role": "Sales Manager", "email": "sales@stockghost.com"},
                    "inventory_mgr": {"id": 3, "username": "inventory_mgr", "full_name": "Inventory Head", "password": "inv123", "role": "Inventory Manager", "email": "inventory@stockghost.com"},
                }
            if u in StockGhostHandler.USERS and new_pass:
                StockGhostHandler.USERS[u]["password"] = new_pass
                SYSTEM_AUDIT_TRAIL.insert(0, {
                    "id": len(SYSTEM_AUDIT_TRAIL) + 1,
                    "timestamp": datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S"),
                    "action": "PASSWORD_RESET",
                    "details": f"Admin updated password credentials for manager '{u}'",
                    "destination": "RBAC Security Directory",
                    "user_id": data.get("reset_by", "admin"),
                    "role": "Admin",
                    "department": "Enterprise Security",
                    "status": "UPDATED"
                })
                self._set_headers(200)
                self.wfile.write(json.dumps({
                    "message": f"Password for manager '{u}' updated successfully.",
                    "username": u
                }).encode('utf-8'))
                return
            else:
                self._set_headers(404)
                self.wfile.write(json.dumps({"error": "User not found or new password was empty."}).encode('utf-8'))
                return

        if path == '/api/auth/login':
            ident = (data.get('username') or data.get('email', '')).strip().lower()
            password = (data.get('password') or '').strip()
            
            if not hasattr(StockGhostHandler, 'USERS'):
                StockGhostHandler.USERS = {
                    "admin": {"id": 1, "username": "admin", "full_name": "System Administrator", "password": "admin123", "role": "Admin", "email": "admin@stockghost.com"},
                    "sales_mgr": {"id": 2, "username": "sales_mgr", "full_name": "Sales & Clearance Lead", "password": "sales123", "role": "Sales Manager", "email": "sales@stockghost.com"},
                    "inventory_mgr": {"id": 3, "username": "inventory_mgr", "full_name": "Inventory Head", "password": "inv123", "role": "Inventory Manager", "email": "inventory@stockghost.com"},
                }

            user = StockGhostHandler.USERS.get(ident)
            if not user or user.get("password") != password:
                self._set_headers(401)
                self.wfile.write(json.dumps({"error": "Invalid User ID or Password. Authentication failed."}).encode('utf-8'))
                return

            # Record login in System Audit Trail
            SYSTEM_AUDIT_TRAIL.insert(0, {
                "id": len(SYSTEM_AUDIT_TRAIL) + 1,
                "timestamp": datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S"),
                "action": "USER_LOGIN",
                "details": f"Manager '{user['username']}' authenticated successfully with role '{user['role']}'",
                "destination": "StockGhost Enterprise Terminal",
                "user_id": user['username'],
                "role": user['role'],
                "department": user.get('role', 'Operations'),
                "status": "AUTHENTICATED"
            })

            self._set_headers(200)
            self.wfile.write(json.dumps({
                "message": f"Welcome {user['full_name']}! Authenticated as {user['role']}.",
                "token": f"jwt-token-{user['role'].lower().replace(' ', '-')}",
                "user": {
                    "id": user["id"],
                    "username": user["username"],
                    "name": user["full_name"],
                    "full_name": user["full_name"],
                    "role": user["role"],
                    "email": user.get("email", "")
                }
            }).encode('utf-8'))
            return

        if path == '/api/products/import':
            items = data.get('products', [])
            PRODUCTS.clear()
            for idx, item in enumerate(items):
                p_obj = MockProduct(
                    id=item.get('id', idx + 1),
                    sku=item.get('sku', f"SKU-{idx+1}"),
                    name=item.get('name', f"Product {idx+1}"),
                    description=item.get('description', item.get('category', '')),
                    category_id=1,
                    supplier_id=1,
                    cost_price=float(item.get('cost', item.get('cost_price', 1000))),
                    selling_price=float(item.get('price', item.get('selling_price', 1500))),
                    current_stock=int(item.get('stock', item.get('current_stock', 50))),
                    min_stock=int(item.get('min_stock', 10)),
                    first_received_days_ago=int(item.get('age', item.get('stock_age_days', 60))),
                    last_sale_days_ago=int(item.get('inact', item.get('inactivity_days', 30)))
                )
                PRODUCTS.append(p_obj)
            
            self._set_headers(200)
            self.wfile.write(json.dumps({
                "message": f"Successfully imported {len(PRODUCTS)} products into StockGhost catalog.",
                "count": len(PRODUCTS)
            }).encode('utf-8'))
            return

        if path == '/api/products/clear':
            PRODUCTS.clear()
            SALES.clear()
            PURCHASES.clear()
            self._set_headers(200)
            self.wfile.write(json.dumps({"message": "Catalog and transactions cleared."}).encode('utf-8'))
            return

        if path == '/api/products/update':
            pid = data.get('id')
            sku = data.get('sku')
            p = next((x for x in PRODUCTS if x.id == pid or x.sku == sku), None)
            if not p:
                self._set_headers(404)
                self.wfile.write(json.dumps({"error": "Product not found"}).encode('utf-8'))
                return
            if 'name' in data: p.name = data['name']
            if 'stock' in data: p.current_stock = int(data['stock'])
            if 'cost' in data: p.cost_price = float(data['cost'])
            if 'price' in data: p.selling_price = float(data['price'])
            if 'age' in data: p.first_received_date = date.today() - timedelta(days=int(data['age']))
            if 'inact' in data: p.last_sale_date = date.today() - timedelta(days=int(data['inact']))
            
            SYSTEM_AUDIT_TRAIL.insert(0, {
                "id": len(SYSTEM_AUDIT_TRAIL) + 1,
                "timestamp": datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S"),
                "action": "STOCK_INVENTORY_UPDATE",
                "details": f"Updated SKU {p.sku} ({p.name}) stock to {p.current_stock} units",
                "destination": "Main Warehouse Stock Ledger",
                "user_id": data.get("executed_by", "inventory_mgr"),
                "role": data.get("user_role", "Inventory Manager"),
                "department": "Inventory Management",
                "status": "APPROVED"
            })
            self._set_headers(200)
            self.wfile.write(json.dumps({"message": f"SKU {p.sku} updated successfully", "product": p.to_dict()}).encode('utf-8'))
            return

        if path == '/api/products/rma':
            pid = data.get('id')
            sku = data.get('sku')
            qty = int(data.get('quantity', 1))
            rate = float(data.get('unit_rate', 0.0))
            memo = data.get('memo', 'Supplier RMA Return')
            dest = data.get('destination', 'Vendor RMA Hub / Commercial Credit')
            p = next((x for x in PRODUCTS if x.id == pid or x.sku == sku), None)
            if not p or p.current_stock < qty:
                self._set_headers(400)
                self.wfile.write(json.dumps({"error": "Invalid product or insufficient stock for RMA return."}).encode('utf-8'))
                return
            
            p.current_stock -= qty
            total_credit = qty * rate if rate > 0 else (qty * p.cost_price)
            rma_tx = {
                "id": len(SALES) + 1,
                "invoice_number": f"RMA-{int(datetime.utcnow().timestamp())}",
                "product_id": p.id,
                "product_name": f"RMA: {p.name}",
                "quantity": qty,
                "unit_price": rate or p.cost_price,
                "discount_percent": 0.0,
                "total_amount": total_credit,
                "sale_date": str(date.today()),
                "channel": "Supplier RMA Return",
                "destination": dest,
                "executed_by": data.get("executed_by", "inventory_mgr"),
                "user_role": data.get("user_role", "Inventory Manager"),
                "department": "Supplier Returns (RMA)"
            }
            SALES.insert(0, rma_tx)
            SYSTEM_AUDIT_TRAIL.insert(0, {
                "id": len(SYSTEM_AUDIT_TRAIL) + 1,
                "timestamp": datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S"),
                "action": "SUPPLIER_RMA_RETURN",
                "details": f"Dispatched RMA return for {qty} units of {p.name} (Credit: ₹{total_credit:,.2f}, Ref: {memo})",
                "destination": dest,
                "user_id": data.get("executed_by", "inventory_mgr"),
                "role": data.get("user_role", "Inventory Manager"),
                "department": "Supplier Returns (RMA)",
                "status": "APPROVED"
            })
            self._set_headers(200)
            self.wfile.write(json.dumps({"message": f"Successfully processed RMA return of {qty} units of {p.name}!", "credit": total_credit}).encode('utf-8'))
            return

        if path == '/api/products/bundle':
            p1_id = data.get('p1_id')
            p2_id = data.get('p2_id')
            qty = int(data.get('quantity', 1))
            combo_price = float(data.get('combo_price', 1000.0))
            dest = data.get('destination', 'Retail POS / Promotional Clearance')
            p1 = next((x for x in PRODUCTS if x.id == p1_id), None)
            p2 = next((x for x in PRODUCTS if x.id == p2_id), None)
            if not p1 or not p2 or p1.current_stock < qty or p2.current_stock < qty:
                self._set_headers(400)
                self.wfile.write(json.dumps({"error": "Invalid bundle products or insufficient stock."}).encode('utf-8'))
                return
            
            p1.current_stock -= qty
            p2.current_stock -= qty
            p1.last_sale_date = date.today()
            p2.last_sale_date = date.today()
            bnd_total = qty * combo_price
            bnd_tx = {
                "id": len(SALES) + 1,
                "invoice_number": f"BND-{int(datetime.utcnow().timestamp())}",
                "product_id": p1.id,
                "product_name": f"Bundle: {p1.name} + {p2.name}",
                "quantity": qty,
                "unit_price": combo_price,
                "discount_percent": 15.0,
                "total_amount": bnd_total,
                "sale_date": str(date.today()),
                "channel": "Promotional Bundle POS",
                "destination": dest,
                "executed_by": data.get("executed_by", "sales_mgr"),
                "user_role": data.get("user_role", "Sales Manager"),
                "department": "Sales Operations"
            }
            SALES.insert(0, bnd_tx)
            SYSTEM_AUDIT_TRAIL.insert(0, {
                "id": len(SYSTEM_AUDIT_TRAIL) + 1,
                "timestamp": datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S"),
                "action": "PROMOTIONAL_BUNDLE_SALE",
                "details": f"Sold {qty} promotional bundles ({p1.sku} + {p2.sku}) for ₹{bnd_total:,.2f}",
                "destination": dest,
                "user_id": data.get("executed_by", "sales_mgr"),
                "role": data.get("user_role", "Sales Manager"),
                "department": "Sales Operations",
                "status": "APPROVED"
            })
            self._set_headers(200)
            self.wfile.write(json.dumps({"message": f"Successfully sold {qty} bundles for ₹{bnd_total:,.2f}!", "total": bnd_total}).encode('utf-8'))
            return

        if path == '/api/simulation/calculate':
            if not PRODUCTS:
                self._set_headers(200)
                self.wfile.write(json.dumps({
                    "units_sold": 0, "recovered_capital": 0.0, "remaining_stock": 0, "remaining_capital": 0.0, "new_dsrs": 0, "effective_price": 0.0
                }).encode('utf-8'))
                return
            pid = int(data.get('product_id', PRODUCTS[0].id))
            disc = float(data.get('discount_percent', 25.0))
            p = next((x for x in PRODUCTS if x.id == pid), PRODUCTS[0])
            dsrs_info = calculate_dsrs(p)
            sim = simulate_clearance(p, dsrs_info, disc)
            self._set_headers(200)
            self.wfile.write(json.dumps(sim).encode('utf-8'))
            return

        if path == '/api/simulation/apply':
            if not PRODUCTS:
                self._set_headers(400)
                self.wfile.write(json.dumps({"error": "No products loaded in catalog."}).encode('utf-8'))
                return
            pid = int(data.get('product_id', PRODUCTS[0].id))
            disc = float(data.get('discount_percent', 25.0))
            destination = data.get('destination', 'Clearance Liquidation Pool / Cash Inflow')
            user_id = data.get('executed_by', 'sales_mgr')
            user_role = data.get('user_role', 'Sales Manager')
            dept = data.get('department', user_role)
            p = next((x for x in PRODUCTS if x.id == pid), PRODUCTS[0])
            dsrs_info = calculate_dsrs(p)
            sim = simulate_clearance(p, dsrs_info, disc)
            p.current_stock -= sim["units_sold"]
            p.last_sale_date = date.today()
            clr_sale = {
                "id": len(SALES) + 1,
                "invoice_number": f"CLR-{int(datetime.utcnow().timestamp())}",
                "product_id": p.id,
                "product_name": p.name,
                "quantity": sim["units_sold"],
                "unit_price": p.selling_price,
                "discount_percent": disc,
                "total_amount": sim["recovered_capital"],
                "sale_date": str(date.today()),
                "channel": "Clearance Campaign",
                "destination": destination,
                "executed_by": user_id,
                "user_role": user_role,
                "department": dept
            }
            SALES.insert(0, clr_sale)
            SYSTEM_AUDIT_TRAIL.insert(0, {
                "id": len(SYSTEM_AUDIT_TRAIL) + 1,
                "timestamp": datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S"),
                "action": "CLEARANCE_EXECUTION",
                "details": f"Clearance {disc}% on {p.name}: Cleared {sim['units_sold']} units (Recovered: ₹{sim['recovered_capital']:,.2f})",
                "destination": destination,
                "user_id": user_id,
                "role": user_role,
                "department": dept,
                "status": "APPROVED"
            })
            self._set_headers(200)
            self.wfile.write(json.dumps({
                "message": f"Successfully executed {disc}% clearance! Cleared {sim['units_sold']} units and recovered ₹{sim['recovered_capital']:,.2f}.",
                "new_dsrs": sim["new_dsrs"]
            }).encode('utf-8'))
            return

        if path == '/api/sales':
            pid = int(data.get('product_id', 1))
            qty = int(data.get('quantity', 1))
            price = float(data.get('unit_price', 1000.0))
            disc = float(data.get('discount_percent', 0.0))
            destination = data.get('destination', data.get('channel', 'Retail POS Counter 1'))
            user_id = data.get('executed_by', 'sales_mgr')
            user_role = data.get('user_role', 'Sales Manager')
            dept = data.get('department', user_role)
            p = next((x for x in PRODUCTS if x.id == pid), PRODUCTS[0])
            p.current_stock -= qty
            p.last_sale_date = date.today()
            sale = {
                "id": len(SALES) + 1,
                "invoice_number": f"INV-{int(datetime.utcnow().timestamp())}",
                "product_id": p.id,
                "product_name": p.name,
                "quantity": qty,
                "unit_price": price,
                "discount_percent": disc,
                "total_amount": qty * price * (1.0 - disc / 100.0),
                "sale_date": str(date.today()),
                "channel": data.get('channel', 'Retail POS'),
                "destination": destination,
                "executed_by": user_id,
                "user_role": user_role,
                "department": dept
            }
            SALES.insert(0, sale)
            SYSTEM_AUDIT_TRAIL.insert(0, {
                "id": len(SYSTEM_AUDIT_TRAIL) + 1,
                "timestamp": datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S"),
                "action": "OUTWARD_SALE",
                "details": f"Sold {qty} units of {p.name} (Total: ₹{sale['total_amount']:,.2f})",
                "destination": destination,
                "user_id": user_id,
                "role": user_role,
                "department": dept,
                "status": "APPROVED"
            })
            self._set_headers(201)
            self.wfile.write(json.dumps(sale).encode('utf-8'))
            return

        if path == '/api/purchases':
            pid = int(data.get('product_id', 1))
            sid = int(data.get('supplier_id', 1))
            qty = int(data.get('quantity', 50))
            cost = float(data.get('unit_cost', 1000.0))
            destination = data.get('destination', 'Warehouse Bay C-12 (Central Logistics WH)')
            user_id = data.get('executed_by', 'inventory_mgr')
            user_role = data.get('user_role', 'Inventory Manager')
            dept = data.get('department', user_role)
            p = next((x for x in PRODUCTS if x.id == pid), PRODUCTS[0])
            s = next((x for x in SUPPLIERS if x["id"] == sid), SUPPLIERS[0])
            p.current_stock += qty
            po = {
                "id": len(PURCHASES) + 1,
                "order_number": f"PO-{int(datetime.utcnow().timestamp())}",
                "supplier_id": s["id"],
                "supplier_name": s["name"],
                "product_id": p.id,
                "product_name": p.name,
                "quantity": qty,
                "unit_cost": cost,
                "total_cost": qty * cost,
                "purchase_date": str(date.today()),
                "status": "Received",
                "destination": destination,
                "executed_by": user_id,
                "user_role": user_role,
                "department": dept
            }
            PURCHASES.insert(0, po)
            SYSTEM_AUDIT_TRAIL.insert(0, {
                "id": len(SYSTEM_AUDIT_TRAIL) + 1,
                "timestamp": datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S"),
                "action": "PURCHASE_INTAKE",
                "details": f"Inward PO {qty} units of {p.name} from {s['name']} (₹{po['total_cost']:,.2f})",
                "destination": destination,
                "user_id": user_id,
                "role": user_role,
                "department": dept,
                "status": "VERIFIED"
            })
            self._set_headers(201)
            self.wfile.write(json.dumps(po).encode('utf-8'))
            return

        if path == '/api/chatbot/query':
            user_msg = data.get('message', '').lower()
            if not PRODUCTS:
                reply = "📁 **Catalog is currently empty.** Please import your business CSV catalog using the StockGhost portal to view dead stock analytics, calculate blocked capital, and run clearance simulations."
            else:
                total_val = sum(p.current_stock * p.cost_price for p in PRODUCTS)
                blocked_prods = [p for p in PRODUCTS if calculate_dsrs(p)["dsrs_score"] >= 61]
                blocked_cap = sum(p.current_stock * p.cost_price for p in blocked_prods)
                dead_prods = [p for p in PRODUCTS if calculate_dsrs(p)["dsrs_score"] >= 81]
                sorted_by_cap = sorted(PRODUCTS, key=lambda p: p.current_stock * p.cost_price, reverse=True)
                top_p = sorted_by_cap[0] if sorted_by_cap else None

                if "capital" in user_msg and ("most" in user_msg or "top" in user_msg or "highest" in user_msg):
                    if top_p:
                        ds = calculate_dsrs(top_p)
                        top_val = top_p.current_stock * top_p.cost_price
                        reply = f"💰 **Top Blocked Capital Item:**\n\n**{top_p.name}** (`{top_p.sku}`) blocks the largest capital: **₹{top_val:,.2f}**.\n\n• **Current Stock:** {top_p.current_stock} units\n• **Stock Age:** {ds['stock_age_days']} days (Idle: {ds['days_since_last_sale']} days)\n• **DSRS Score:** **{ds['dsrs_score']}/100** ({ds['risk_tier']})\n\n💡 **Prescriptive Action:** Execute an immediate clearance discount in the simulator to unlock tied capital."
                    else:
                        reply = "No product records found in active catalog."
                elif "total" in user_msg or "how much" in user_msg or "blocked" in user_msg:
                    pct = (blocked_cap / total_val * 100.0) if total_val > 0 else 0.0
                    reply = f"📊 **Blocked Capital Summary:**\n\n• **Total Inventory Value:** ₹{total_val:,.2f}\n• **Total Blocked Capital:** **₹{blocked_cap:,.2f}** ({pct:.1f}% of inventory)\n• **Dead Stock SKUs (DSRS ≥ 81):** {len(dead_prods)} item(s)\n• **High Risk SKUs (DSRS 61–80):** {len(blocked_prods) - len(dead_prods)} item(s)"
                elif "simulate" in user_msg or "discount" in user_msg:
                    if top_p:
                        ds = calculate_dsrs(top_p)
                        sim = simulate_clearance(top_p, ds, 25.0)
                        reply = f"🧮 **Clearance Simulation for {top_p.name} (25% Discount):**\n\n• **Estimated Units Cleared:** **{sim['units_sold']}** of {top_p.current_stock} units\n• **Capital Recovered:** **₹{sim['recovered_capital']:,.2f}**\n• **Remaining Stock:** {sim['remaining_stock']} units\n• **Projected DSRS:** Drops to **{sim['new_dsrs']}/100**!"
                    else:
                        reply = "Please load products to simulate clearance."
                elif "dead stock" in user_msg or "dead" in user_msg:
                    if not dead_prods:
                        reply = f"✅ **Zero Dead Stock:** None of the {len(PRODUCTS)} SKUs in your catalog exceed the DSRS 80 threshold."
                    else:
                        lines = [f"• **{p.name}** (`{p.sku}`): {p.current_stock} units | ₹{p.current_stock * p.cost_price:,.2f} | DSRS {calculate_dsrs(p)['dsrs_score']}" for p in dead_prods[:5]]
                        reply = f"🚨 **Found {len(dead_prods)} Dead Stock Item(s):**\n\n" + "\n".join(lines)
                else:
                    reply = f"🏢 **StockGhost Enterprise Overview:**\n\n• Catalog: {len(PRODUCTS)} active SKUs\n• Total Valuation: ₹{total_val:,.2f}\n• Blocked Capital: ₹{blocked_cap:,.2f} across {len(blocked_prods)} stagnant item(s)."

            self._set_headers(200)
            self.wfile.write(json.dumps({"reply": reply, "intent": "QUERY"}).encode('utf-8'))
            return

        self._set_headers(200)
        self.wfile.write(json.dumps({"status": "ok"}).encode('utf-8'))

def run_server():
    server_address = ('0.0.0.0', PORT)
    httpd = HTTPServer(server_address, StockGhostHandler)
    print("==================================================")
    print(f"🚀 StockGhost Standalone Backend running on port {PORT}")
    print(f"   API Health Check: http://127.0.0.1:{PORT}/api/health")
    print(f"   Zero External Dependencies Required!")
    print("==================================================")
    httpd.serve_forever()

if __name__ == '__main__':
    run_server()
