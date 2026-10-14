"""Creates ONLY the shared Demo Workspace (clearly flagged as demo data). Real customer workspaces are never touched.
Usage: python seed.py          -> create the demo workspace if missing
       python seed.py --reset  -> rebuild the demo workspace from scratch (other workspaces untouched)
"""
import sys

from app import create_app
from extensions import db
from models import ADMIN, INVENTORY_MANAGER, SALES_MANAGER, VIEWER, User, Workspace
from routes.workspace import wipe_business_data
from services.demo_data import load_demo
from services.dsrs import run_analysis

DEMO_PASSWORD = "Demo@12345"
DEMO_USERS = [("Demo Viewer", "demo-viewer@stockghost.demo", VIEWER), ("Demo Admin", "admin@stockghost.com", ADMIN),
              ("Demo Inventory Manager", "inventory@stockghost.com", INVENTORY_MANAGER), ("Demo Sales Manager", "sales@stockghost.com", SALES_MANAGER)]


def seed(reset=False):
    app = create_app()
    with app.app_context():
        ws = Workspace.query.filter_by(is_shared_demo=True).first()
        if ws and reset:
            wipe_business_data(ws.id)
            db.session.commit()
        elif ws:
            print("Demo workspace already exists. Use --reset to rebuild it.")
            return
        if not ws:
            ws = Workspace(name="Demo Workspace (sample data)", business_type="Electronics", is_demo=True, is_shared_demo=True,
                           onboarding_completed=True, risk_config={})
            db.session.add(ws)
            db.session.flush()
            for name, email, role in DEMO_USERS:
                if not User.query.filter_by(email=email).first():
                    u = User(workspace_id=ws.id, name=name, email=email, role=role)
                    u.set_password(DEMO_PASSWORD)
                    db.session.add(u)
        info = load_demo(ws)
        ws.data_version = (ws.data_version or 0) + 1
        db.session.flush()
        s = run_analysis(ws, commit=False)
        db.session.commit()
        print(f"Demo workspace ready: {info['products']} products, {info['sales']} sales, {info['purchases']} purchases; blocked capital {s['blocked_capital']:,.0f}")
        print("Demo logins (testing only): " + ", ".join(e for _, e, _ in DEMO_USERS) + f"  password: {DEMO_PASSWORD}")


if __name__ == "__main__":
    seed("--reset" in sys.argv)
