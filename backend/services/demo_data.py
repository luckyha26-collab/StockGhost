"""Demo data generator (sample catalogue: 100 products, 10 suppliers, ~9 months of sales/purchases with deliberate
dead stock). Used by `python seed.py` for the shared Demo Workspace and by "Explore demo data" in onboarding.
All rows are written into the given workspace - nothing here touches other tenants."""
import datetime as dt
import random

from extensions import db
from models import InventoryTransaction, Product, Purchase, Sale, Supplier

CATALOG = {
    "Electronics": [("Gaming Keyboard", 1500), ("Wireless Mouse", 450), ("Bluetooth Speaker", 1200), ("Noise Cancelling Headphones", 3200),
                    ("USB-C Hub 7-in-1", 900), ("Webcam 1080p", 1400), ("Smart Watch Fit", 2600), ("Power Bank 20000mAh", 900),
                    ("LED Monitor 24 inch", 6500), ("Portable SSD 1TB", 4800)],
    "Mobile Accessories": [("Phone Case Armor", 120), ("Tempered Glass Guard", 60), ("Fast Charger 65W", 700), ("Lightning Cable 1m", 150),
                           ("True Wireless Earbuds", 900), ("Phone Tripod Stand", 350), ("Car Phone Mount", 250), ("Selfie Ring Light", 480),
                           ("Memory Card 128GB", 520), ("Wireless Charger Pad", 800)],
    "Home Appliances": [("Air Fryer 3.5L", 2800), ("Electric Kettle 1.5L", 650), ("Mixer Grinder 750W", 1800), ("Induction Cooktop", 2200),
                        ("Room Heater", 1500), ("Table Fan 400mm", 1300), ("Steam Iron", 900), ("Water Purifier RO", 7500),
                        ("Vacuum Cleaner", 4200), ("Sandwich Toaster", 1100)],
    "Furniture": [("Ergonomic Office Chair", 4800), ("Study Desk Oak", 3500), ("Bookshelf 5-Tier", 2900), ("Shoe Rack 4-Tier", 1200),
                  ("LED Floor Lamp", 1300), ("Bean Bag XL", 1600), ("Wardrobe Organizer", 1800), ("Folding Dining Table", 1400),
                  ("TV Unit Walnut", 5200), ("Recliner Sofa", 12500)],
    "Stationery": [("A4 Paper Ream 500", 220), ("Gel Pen Box 50", 90), ("Spiral Notebook Pack", 180), ("Desk Organizer Mesh", 320),
                   ("Whiteboard 60x90", 780), ("Marker Set 12", 140), ("Heavy Duty Stapler", 210), ("File Folder Pack", 160),
                   ("Scientific Calculator", 480), ("Sticky Notes Bulk", 110)],
    "Sports & Fitness": [("Yoga Mat 6mm", 550), ("Dumbbell Set 10kg", 1900), ("Badminton Racket Pair", 1100), ("Football Size 5", 650),
                         ("Cricket Bat Willow", 3800), ("Skipping Rope Pro", 150), ("Resistance Bands Set", 400), ("Gym Gloves", 300),
                         ("Foldable Treadmill", 22000), ("Cycling Helmet", 1200)],
    "Kitchen & Dining": [("Non-stick Cookware Set", 2400), ("Dinner Set 24pc", 2100), ("Pressure Cooker 5L", 1500), ("Steel Lunch Box", 450),
                         ("Insulated Bottle 1L", 280), ("Knife Set 6pc", 700), ("Casserole Set 3pc", 900), ("Glass Tumbler Set", 350),
                         ("Spice Rack Rotating", 520), ("Bamboo Chopping Board", 240)],
    "Fashion": [("Leather Wallet", 450), ("Backpack 30L", 900), ("Polarized Sunglasses", 700), ("Analog Watch Men", 1500),
                ("Formal Leather Belt", 350), ("Laptop Sleeve 15in", 480), ("Travel Duffel Bag", 1300), ("Woolen Muffler", 260),
                ("Running Shoes", 1800), ("Denim Jacket", 1600)],
    "Toys & Games": [("RC Racing Car", 1200), ("Building Blocks 500pc", 650), ("Strategy Board Game", 800), ("Jigsaw Puzzle 1000pc", 450),
                     ("Plush Teddy 3ft", 900), ("Kids Art Set", 380), ("Remote Helicopter", 1400), ("Wooden Chess Set", 600),
                     ("Play Kitchen Set", 1700), ("Mini Camera Drone", 5200)],
    "Health & Beauty": [("Electric Toothbrush", 1100), ("Hair Dryer 2000W", 900), ("Beard Trimmer Pro", 1200), ("Massage Gun", 2900),
                        ("Digital Thermometer", 250), ("BP Monitor", 1300), ("Face Steamer", 700), ("Digital Weighing Scale", 650),
                        ("Hand Sanitizer 5L", 600), ("Vitamin Combo Pack", 900)],
}
SUPPLIERS = [("TechNova Distributors", "Rajesh Kulkarni | +91 98220 11234 | sales@technova.in"),
             ("Bharat Electronics Wholesale", "Anita Deshmukh | +91 98900 45671 | orders@bharatew.in"),
             ("Sahyadri Home Supplies", "Vikram Patil | +91 97650 22110 | vikram@sahyadrihome.in"),
             ("Metro Furniture Works", "Suresh Iyer | +91 99210 33489 | suresh@metrofurniture.in"),
             ("PaperTrail Stationers", "Neha Joshi | +91 98230 77812 | neha@papertrail.in"),
             ("ActiveLife Sports Co.", "Arjun Mehta | +91 98600 55901 | arjun@activelife.in"),
             ("Kitchenwala Traders", "Pooja Shah | +91 99700 12093 | pooja@kitchenwala.in"),
             ("StyleHub Fashion Mart", "Imran Sheikh | +91 98810 66720 | imran@stylehub.in"),
             ("PlayZone Toys Pvt Ltd", "Kavita Rao | +91 98500 31877 | kavita@playzone.in"),
             ("WellCare Health Traders", "Dr. Sameer Kale | +91 97300 90455 | sameer@wellcare.in")]
PROFILES = ["healthy"] * 46 + ["slow"] * 26 + ["high"] * 16 + ["dead"] * 12


def _gen_sales(rng, start_ago, last_ago, gap, qty_max, slope=0.0):
    days, d = [], start_ago - rng.randint(2, 6)
    span = max(1, start_ago - last_ago)
    while d >= last_ago:
        days.append((d, rng.randint(1, qty_max)))
        t = 1 - (d - last_ago) / span
        d -= max(1, round(rng.uniform(*gap) * (1 + slope * t)))
    return days



WAREHOUSES = ["Main Warehouse", "Pune Warehouse", "Nagpur Store"]
REGIONS = ["Maharashtra", "Gujarat", "Karnataka", "Delhi NCR", "Tamil Nadu"]


def load_demo(ws, user_id=None, seed=42):
    """Generate the demo dataset into workspace `ws` (must be empty)."""
    rng, today, wid = random.Random(seed), dt.date.today(), ws.id
    suppliers = [Supplier(workspace_id=wid, name=n, contact=c.split(" | ")[0], phone=c.split(" | ")[1], email=c.split(" | ")[2],
                          lead_time_days=rng.choice([5, 7, 10, 14, 21])) for n, c in SUPPLIERS]
    db.session.add_all(suppliers)
    db.session.flush()
    cat_supplier = dict(zip(CATALOG.keys(), suppliers))
    items = [(cat, name, cost) for cat, lst in CATALOG.items() for name, cost in lst]
    profiles = PROFILES[:]
    rng.shuffle(profiles)
    purchases, sales, txs, products = [], [], [], []
    for i, (cat, name, cost) in enumerate(items, start=1):
        prof = "dead" if name == "Gaming Keyboard" else profiles[i - 1]
        reorder = max(4, min(50, int(9000 / (cost ** 0.8))))
        margin = rng.uniform(1.25, 1.6)
        price = round(cost * margin / 5) * 5 or cost + 5
        qty_max = max(2, min(8, reorder // 8))
        writeoff = 0
        if name == "Gaming Keyboard":
            reorder, price, start, last_ago, remaining, lot2 = 50, 2400, 210, 180, 500, None
            sold = _gen_sales(rng, start, last_ago, (6, 12), 6)
        elif prof == "healthy":
            start, last_ago = rng.randint(200, 290), rng.randint(0, 5)
            sold = _gen_sales(rng, start, last_ago, (1.5, 4.5), qty_max, slope=rng.choice([-0.4, 0, 0, 0.6]))
            remaining, lot2 = max(2, int(reorder * rng.uniform(0.8, 2.4))), rng.randint(8, 45)
            writeoff = rng.choice([0, 0, 0, 2, 3])
        elif prof == "slow":
            start, last_ago = rng.randint(150, 260), rng.randint(14, 50)
            sold = _gen_sales(rng, start, last_ago, (7, 18), max(2, qty_max // 2), slope=rng.choice([0, 0.5, 1.0]))
            remaining, lot2 = int(reorder * rng.uniform(2.5, 5)), rng.randint(25, 90)
            writeoff = rng.choice([0, 0, 1])
        elif prof == "high":
            start, last_ago = rng.randint(150, 250), rng.randint(46, 90)
            sold = _gen_sales(rng, start, last_ago, (8, 20), max(2, qty_max // 2))
            remaining, lot2 = int(reorder * rng.uniform(3, 6)), None
        else:
            start = rng.randint(200, 340)
            last_ago = start - rng.randint(15, 60) if rng.random() < 0.75 else start
            sold = _gen_sales(rng, start, max(last_ago, 150), (5, 14), max(2, qty_max // 2)) if last_ago < start else []
            remaining, lot2 = int(reorder * rng.uniform(4, 10)), None
        sold_total = sum(q for _, q in sold)
        total_in = sold_total + remaining + writeoff
        lots = [(start, total_in)]
        if lot2:
            l2 = min(remaining, max(1, remaining if prof == "healthy" else remaining // 2))
            lots = [(start, total_in - l2), (lot2, l2)]
        products.append(Product(workspace_id=wid, name=name, sku=f"SG-{cat[:3].upper()}-{i:04d}", category=cat, supplier_id=cat_supplier[cat].id,
                                cost_price=cost, selling_price=price, quantity=remaining, reorder_level=reorder,
                                warehouse=WAREHOUSES[i % len(WAREHOUSES)], stock_source="snapshot"))
        db.session.add(products[-1])
        db.session.flush()
        pid = products[-1].id
        for ago, q in lots:
            if q <= 0:
                continue
            d = today - dt.timedelta(days=ago)
            purchases.append(dict(workspace_id=wid, product_id=pid, supplier_id=cat_supplier[cat].id, quantity=q, unit_cost=cost, purchase_date=d,
                                  received_date=d + dt.timedelta(days=rng.randint(3, 12)), reference=f"PO-{1000 + len(purchases)}"))
            txs.append(dict(workspace_id=wid, product_id=pid, transaction_type="PURCHASE", quantity=q, date=d, note="Purchase received", user_id=user_id))
        for ago, q in sold:
            d = today - dt.timedelta(days=ago)
            sales.append(dict(workspace_id=wid, product_id=pid, quantity=q, unit_price=price, sale_date=d, region=rng.choice(REGIONS),
                              customer=f"Customer {rng.randint(1, 400):03d}", order_ref=f"INV-{20000 + len(sales)}"))
            txs.append(dict(workspace_id=wid, product_id=pid, transaction_type="SALE", quantity=q, date=d, note="Sale", user_id=user_id))
        if writeoff:
            txs.append(dict(workspace_id=wid, product_id=pid, transaction_type="WRITE_OFF", quantity=writeoff,
                            date=today - dt.timedelta(days=rng.randint(5, 60)), note="Damaged in storage", user_id=user_id))
    db.session.bulk_insert_mappings(Purchase, purchases)
    db.session.bulk_insert_mappings(Sale, sales)
    db.session.bulk_insert_mappings(InventoryTransaction, txs)
    db.session.flush()
    return {"products": len(products), "suppliers": len(suppliers), "sales": len(sales), "purchases": len(purchases)}
