from flask import Blueprint, request, jsonify
from datetime import datetime, date
from database import db
from models import Product, Category, Supplier, PurchaseOrder, SaleTransaction, Recommendation
from algorithms.dsrs import calculate_dsrs
from algorithms.recommendation import generate_recommendations

inventory_bp = Blueprint('inventory_bp', __name__)

@inventory_bp.route('/products', methods=['GET'])
def get_products():
    tier_filter = request.args.get('tier', '').strip()
    category_id = request.args.get('category_id', type=int)
    search_query = request.args.get('search', '').strip().lower()

    query = Product.query
    if category_id:
        query = query.filter(Product.category_id == category_id)

    products = query.all()
    results = []

    for p in products:
        p_dict = p.to_dict()
        dsrs_info = calculate_dsrs(p)
        p_dict["dsrs"] = dsrs_info

        # Filter by tier if specified
        if tier_filter and dsrs_info["tier"].lower() != tier_filter.lower():
            continue

        # Filter by search
        if search_query:
            if (search_query not in p.name.lower() and 
                search_query not in p.sku.lower() and
                search_query not in (p.category.name.lower() if p.category else '')):
                continue

        results.append(p_dict)

    return jsonify(results), 200

@inventory_bp.route('/products/<int:product_id>', methods=['GET'])
def get_product(product_id):
    product = db.session.get(Product, product_id)
    if not product:
        return jsonify({"error": "Product not found"}), 404
    p_dict = product.to_dict()
    dsrs_info = calculate_dsrs(product)
    p_dict["dsrs"] = dsrs_info
    p_dict["recommendations"] = generate_recommendations(product, dsrs_info)
    return jsonify(p_dict), 200

@inventory_bp.route('/products', methods=['POST'])
def create_product():
    data = request.get_json() or {}
    try:
        first_received = datetime.strptime(data.get('first_received_date', str(date.today())), "%Y-%m-%d").date()
    except Exception:
        first_received = date.today()

    product = Product(
        sku=data.get('sku'),
        name=data.get('name'),
        description=data.get('description', ''),
        category_id=data.get('category_id'),
        supplier_id=data.get('supplier_id'),
        cost_price=float(data.get('cost_price', 0.0)),
        selling_price=float(data.get('selling_price', 0.0)),
        current_stock=int(data.get('current_stock', 0)),
        min_stock=int(data.get('min_stock', 10)),
        warehouse_location=data.get('warehouse_location', 'Main Bay A-1'),
        first_received_date=first_received,
        last_sale_date=None
    )
    db.session.add(product)
    db.session.commit()

    dsrs_info = calculate_dsrs(product)
    res = product.to_dict()
    res["dsrs"] = dsrs_info
    return jsonify(res), 201

@inventory_bp.route('/products/<int:product_id>', methods=['PUT'])
def update_product(product_id):
    product = db.session.get(Product, product_id)
    if not product:
        return jsonify({"error": "Product not found"}), 404
    data = request.get_json() or {}

    if 'name' in data:
        product.name = data['name']
    if 'sku' in data:
        product.sku = data['sku']
    if 'description' in data:
        product.description = data['description']
    if 'category_id' in data:
        product.category_id = data['category_id']
    if 'supplier_id' in data:
        product.supplier_id = data['supplier_id']
    if 'cost_price' in data:
        product.cost_price = float(data['cost_price'])
    if 'selling_price' in data:
        product.selling_price = float(data['selling_price'])
    if 'current_stock' in data:
        product.current_stock = int(data['current_stock'])
    if 'min_stock' in data:
        product.min_stock = int(data['min_stock'])
    if 'warehouse_location' in data:
        product.warehouse_location = data['warehouse_location']
    if 'last_sale_date' in data and data['last_sale_date']:
        try:
            product.last_sale_date = datetime.strptime(data['last_sale_date'], "%Y-%m-%d").date()
        except Exception:
            pass

    db.session.commit()
    res = product.to_dict()
    res["dsrs"] = calculate_dsrs(product)
    return jsonify(res), 200

@inventory_bp.route('/products/<int:product_id>', methods=['DELETE'])
def delete_product(product_id):
    product = db.session.get(Product, product_id)
    if not product:
        return jsonify({"error": "Product not found"}), 404
    db.session.delete(product)
    db.session.commit()
    return jsonify({"message": f"Product {product_id} deleted successfully"}), 200

# Categories
@inventory_bp.route('/categories', methods=['GET'])
def get_categories():
    categories = Category.query.all()
    return jsonify([c.to_dict() for c in categories]), 200

@inventory_bp.route('/categories', methods=['POST'])
def create_category():
    data = request.get_json() or {}
    category = Category(
        name=data.get('name'),
        description=data.get('description', ''),
        holding_cost_rate=float(data.get('holding_cost_rate', 0.15)),
        obsolescence_factor=float(data.get('obsolescence_factor', 1.0))
    )
    db.session.add(category)
    db.session.commit()
    return jsonify(category.to_dict()), 201

# Suppliers
@inventory_bp.route('/suppliers', methods=['GET'])
def get_suppliers():
    suppliers = Supplier.query.all()
    return jsonify([s.to_dict() for s in suppliers]), 200

@inventory_bp.route('/suppliers', methods=['POST'])
def create_supplier():
    data = request.get_json() or {}
    supplier = Supplier(
        name=data.get('name'),
        contact_person=data.get('contact_person'),
        email=data.get('email'),
        phone=data.get('phone'),
        address=data.get('address'),
        return_policy=data.get('return_policy', '30 Days Return')
    )
    db.session.add(supplier)
    db.session.commit()
    return jsonify(supplier.to_dict()), 201

# Purchases
@inventory_bp.route('/purchases', methods=['GET'])
def get_purchases():
    orders = PurchaseOrder.query.order_by(PurchaseOrder.purchase_date.desc()).all()
    res = []
    for po in orders:
        d = po.to_dict()
        d["product_name"] = po.product.name if po.product else "N/A"
        d["supplier_name"] = po.supplier.name if po.supplier else "N/A"
        res.append(d)
    return jsonify(res), 200

@inventory_bp.route('/purchases', methods=['POST'])
def create_purchase():
    data = request.get_json() or {}
    prod_id = int(data.get('product_id'))
    qty = int(data.get('quantity', 0))
    cost = float(data.get('unit_cost', 0.0))
    
    order = PurchaseOrder(
        order_number=data.get('order_number', f"PO-{int(datetime.utcnow().timestamp())}"),
        supplier_id=int(data.get('supplier_id')),
        product_id=prod_id,
        quantity=qty,
        unit_cost=cost,
        total_cost=qty * cost,
        purchase_date=date.today(),
        status="Received"
    )
    
    # Update product stock
    product = db.session.get(Product, prod_id)
    if product:
        product.current_stock += qty
        
    db.session.add(order)
    db.session.commit()
    return jsonify(order.to_dict()), 201

# Sales
@inventory_bp.route('/sales', methods=['GET'])
def get_sales():
    sales = SaleTransaction.query.order_by(SaleTransaction.sale_date.desc()).all()
    res = []
    for s in sales:
        d = s.to_dict()
        d["product_name"] = s.product.name if s.product else "N/A"
        res.append(d)
    return jsonify(res), 200

@inventory_bp.route('/sales', methods=['POST'])
def create_sale():
    data = request.get_json() or {}
    prod_id = int(data.get('product_id'))
    qty = int(data.get('quantity', 0))
    price = float(data.get('unit_price', 0.0))
    discount = float(data.get('discount_percent', 0.0))
    
    product = db.session.get(Product, prod_id)
    if not product:
        return jsonify({"error": "Product not found"}), 404
        
    if product.current_stock < qty:
        return jsonify({"error": f"Insufficient stock. Available: {product.current_stock}"}), 400

    effective_price = price * (1.0 - discount / 100.0)
    total_amount = qty * effective_price

    sale = SaleTransaction(
        invoice_number=data.get('invoice_number', f"INV-{int(datetime.utcnow().timestamp())}"),
        product_id=prod_id,
        quantity=qty,
        unit_price=price,
        discount_percent=discount,
        total_amount=total_amount,
        sale_date=date.today(),
        channel=data.get('channel', 'Retail POS')
    )

    # Deduct stock and update last sale date
    product.current_stock -= qty
    product.last_sale_date = date.today()

    db.session.add(sale)
    db.session.commit()
    return jsonify(sale.to_dict()), 201
