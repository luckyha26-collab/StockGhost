from datetime import date, timedelta
from database import db
from models import User, Category, Supplier, Product, PurchaseOrder, SaleTransaction, Recommendation
from algorithms.dsrs import calculate_dsrs
from algorithms.recommendation import generate_recommendations

def seed_database():
    # Only seed if tables are empty
    if User.query.first():
        return

    today = date.today()

    # 1. Seed RBAC Users
    admin = User(username="admin", email="admin@stockghost.com", role="Admin")
    admin.set_password("admin123")

    inv_mgr = User(username="inventory_mgr", email="inventory@stockghost.com", role="Inventory Manager")
    inv_mgr.set_password("inv123")

    sales_mgr = User(username="sales_mgr", email="sales@stockghost.com", role="Sales Manager")
    sales_mgr.set_password("sales123")

    db.session.add_all([admin, inv_mgr, sales_mgr])
    db.session.commit()

    # 2. Seed Categories
    cat_peripherals = Category(name="Peripherals & Input", description="Keyboards, mice, and controllers", holding_cost_rate=0.18, obsolescence_factor=1.1)
    cat_furniture = Category(name="Ergonomic Furniture", description="Office chairs and sit-stand desks", holding_cost_rate=0.22, obsolescence_factor=0.9)
    cat_displays = Category(name="Monitors & Displays", description="High-resolution screens and panels", holding_cost_rate=0.15, obsolescence_factor=1.2)
    cat_cables = Category(name="Cables & Accessories", description="USB-C hubs, stands, and adapters", holding_cost_rate=0.12, obsolescence_factor=0.8)
    cat_audio = Category(name="Audio Equipment", description="Headsets and wireless earbuds", holding_cost_rate=0.16, obsolescence_factor=1.0)

    db.session.add_all([cat_peripherals, cat_furniture, cat_displays, cat_cables, cat_audio])
    db.session.commit()

    # 3. Seed Suppliers
    sup1 = Supplier(name="Apex Peripherals Ltd.", contact_person="Rajesh Sharma", email="rajesh@apexperipherals.in", phone="+91 98230 11223", address="Bhiwandi Logistics Hub, Maharashtra", return_policy="30-day RMA with 10% restock fee")
    sup2 = Supplier(name="ErgoTech Works India", contact_person="Sunil Verma", email="sunil@ergotech.co.in", phone="+91 94221 44556", address="MIDC Hingna, Nagpur", return_policy="Return on damaged goods only")
    sup3 = Supplier(name="Nova Display Systems", contact_person="Priya Patel", email="priya@novadisplay.com", phone="+91 99300 77889", address="Electronic City, Bengaluru", return_policy="45-day manufacturer exchange")

    db.session.add_all([sup1, sup2, sup3])
    db.session.commit()

    # 4. Seed Products
    # Slide Benchmark: Gaming Keyboard with 500 units, 210 days age, ₹7,50,000 value, no sale in 185 days
    p_gaming_kb = Product(
        sku="KB-MECH-RGB-01",
        name="RGB Mechanical Gaming Keyboard",
        description="Full-sized tactile mechanical gaming keyboard with customizable per-key RGB backlighting and wrist rest.",
        category_id=cat_peripherals.id,
        supplier_id=sup1.id,
        cost_price=1500.0,
        selling_price=2000.0,
        current_stock=500,
        min_stock=50,
        warehouse_location="Rack B-04 (Hingna WH)",
        first_received_date=today - timedelta(days=210),
        last_sale_date=today - timedelta(days=185)
    )

    # Dead Stock 2: Ergonomic Chair
    p_chair = Product(
        sku="CH-ERG-PREM-02",
        name="Executive Ergonomic High-Back Chair",
        description="High-back lumbar support mesh chair with adjustable 4D armrests.",
        category_id=cat_furniture.id,
        supplier_id=sup2.id,
        cost_price=6000.0,
        selling_price=8500.0,
        current_stock=75,
        min_stock=15,
        warehouse_location="Bay C-12 (Bulky)",
        first_received_date=today - timedelta(days=235),
        last_sale_date=today - timedelta(days=190)
    )

    # High Risk 1: Gaming Mouse
    p_mouse = Product(
        sku="MS-OPT-PRO-03",
        name="Pro Optical Esports Gaming Mouse",
        description="16,000 DPI lightweight optical gaming mouse with PTFE feet.",
        category_id=cat_peripherals.id,
        supplier_id=sup1.id,
        cost_price=800.0,
        selling_price=1350.0,
        current_stock=320,
        min_stock=30,
        warehouse_location="Rack B-06",
        first_received_date=today - timedelta(days=140),
        last_sale_date=today - timedelta(days=78)
    )

    # High Risk 2: RGB Mousepad
    p_mousepad = Product(
        sku="MP-XL-RGB-04",
        name="Extended XXL RGB Gaming Mousepad",
        description="900x400mm waterproof micro-weave surface with 14 RGB lighting modes.",
        category_id=cat_peripherals.id,
        supplier_id=sup1.id,
        cost_price=450.0,
        selling_price=799.0,
        current_stock=260,
        min_stock=40,
        warehouse_location="Rack B-08",
        first_received_date=today - timedelta(days=125),
        last_sale_date=today - timedelta(days=70)
    )

    # Slow Moving: USB-C Hub
    p_hub = Product(
        sku="HB-USBC-7IN1-05",
        name="7-in-1 Aluminum USB-C Hub Adapter",
        description="HDMI 4K, 100W PD charging, 3x USB 3.0, SD/TF card reader hub.",
        category_id=cat_cables.id,
        supplier_id=sup3.id,
        cost_price=650.0,
        selling_price=1199.0,
        current_stock=140,
        min_stock=25,
        warehouse_location="Rack A-02",
        first_received_date=today - timedelta(days=95),
        last_sale_date=today - timedelta(days=42)
    )

    # Healthy 1: Wireless Earbuds
    p_earbuds = Product(
        sku="AU-ANC-TWS-06",
        name="Active Noise-Cancelling TWS Earbuds",
        description="Bluetooth 5.3 earbuds with 32dB active noise cancellation and wireless charging case.",
        category_id=cat_audio.id,
        supplier_id=sup1.id,
        cost_price=1800.0,
        selling_price=2999.0,
        current_stock=65,
        min_stock=20,
        warehouse_location="Rack A-05 (Fast Lane)",
        first_received_date=today - timedelta(days=35),
        last_sale_date=today - timedelta(days=2)
    )

    # Healthy 2: 4K Ultra HD Monitor
    p_monitor = Product(
        sku="MN-4K-27IN-07",
        name="27-inch 4K IPS Creator Monitor",
        description="99% sRGB color-calibrated display with Type-C 90W power delivery.",
        category_id=cat_displays.id,
        supplier_id=sup3.id,
        cost_price=14000.0,
        selling_price=19499.0,
        current_stock=25,
        min_stock=10,
        warehouse_location="Bay D-01",
        first_received_date=today - timedelta(days=28),
        last_sale_date=today - timedelta(days=1)
    )

    db.session.add_all([p_gaming_kb, p_chair, p_mouse, p_mousepad, p_hub, p_earbuds, p_monitor])
    db.session.commit()

    # 5. Purchase Orders
    po1 = PurchaseOrder(order_number="PO-2024-001", supplier_id=sup1.id, product_id=p_gaming_kb.id, quantity=500, unit_cost=1500.0, total_cost=750000.0, purchase_date=today - timedelta(days=210), status="Received")
    po2 = PurchaseOrder(order_number="PO-2024-002", supplier_id=sup2.id, product_id=p_chair.id, quantity=75, unit_cost=6000.0, total_cost=450000.0, purchase_date=today - timedelta(days=235), status="Received")
    po3 = PurchaseOrder(order_number="PO-2024-003", supplier_id=sup1.id, product_id=p_mouse.id, quantity=350, unit_cost=800.0, total_cost=280000.0, purchase_date=today - timedelta(days=140), status="Received")
    po4 = PurchaseOrder(order_number="PO-2024-004", supplier_id=sup1.id, product_id=p_earbuds.id, quantity=120, unit_cost=1800.0, total_cost=216000.0, purchase_date=today - timedelta(days=35), status="Received")

    db.session.add_all([po1, po2, po3, po4])
    db.session.commit()

    # 6. Sales Transactions (historical)
    s1 = SaleTransaction(invoice_number="INV-2024-101", product_id=p_earbuds.id, quantity=15, unit_price=2999.0, discount_percent=0.0, total_amount=44985.0, sale_date=today - timedelta(days=2))
    s2 = SaleTransaction(invoice_number="INV-2024-102", product_id=p_monitor.id, quantity=4, unit_price=19499.0, discount_percent=0.0, total_amount=77996.0, sale_date=today - timedelta(days=1))
    s3 = SaleTransaction(invoice_number="INV-2024-080", product_id=p_mouse.id, quantity=10, unit_price=1350.0, discount_percent=5.0, total_amount=12825.0, sale_date=today - timedelta(days=78))
    s4 = SaleTransaction(invoice_number="INV-2024-012", product_id=p_gaming_kb.id, quantity=5, unit_price=2000.0, discount_percent=0.0, total_amount=10000.0, sale_date=today - timedelta(days=185))

    db.session.add_all([s1, s2, s3, s4])
    db.session.commit()

    # 7. Generate Initial Recommendations for Dead & High Risk items
    for prod in [p_gaming_kb, p_chair, p_mouse, p_mousepad, p_hub, p_earbuds, p_monitor]:
        res = calculate_dsrs(prod)
        recs = generate_recommendations(prod, res)
        for r in recs:
            if r["priority"] in ["Critical", "High"]:
                rec_model = Recommendation(
                    product_id=prod.id,
                    action_type=r["action_type"],
                    title=r["title"],
                    details=r["details"],
                    expected_recovery=r["expected_recovery"],
                    discount_percent=r["discount_percent"],
                    priority=r["priority"],
                    status="Pending"
                )
                db.session.add(rec_model)

    db.session.commit()
    print("Database seeded successfully with initial test data.")
