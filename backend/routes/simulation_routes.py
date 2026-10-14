from flask import Blueprint, request, jsonify
from datetime import date
from database import db
from models import Product, SaleTransaction
from algorithms.dsrs import calculate_dsrs
from algorithms.simulator import simulate_clearance

simulation_bp = Blueprint('simulation_bp', __name__)

@simulation_bp.route('/calculate', methods=['POST'])
def calculate_simulation():
    data = request.get_json() or {}
    product_id = data.get('product_id')
    discount_percent = float(data.get('discount_percent', 0.0))

    if not product_id:
        return jsonify({"error": "Product ID is required"}), 400

    product = db.session.get(Product, int(product_id))
    if not product:
        return jsonify({"error": "Product not found"}), 404

    current_dsrs = calculate_dsrs(product)
    result = simulate_clearance(product, current_dsrs, discount_percent)
    return jsonify(result), 200

@simulation_bp.route('/apply', methods=['POST'])
def apply_clearance():
    data = request.get_json() or {}
    product_id = data.get('product_id')
    discount_percent = float(data.get('discount_percent', 0.0))

    product = db.session.get(Product, int(product_id))
    if not product:
        return jsonify({"error": "Product not found"}), 404

    current_dsrs = calculate_dsrs(product)
    sim = simulate_clearance(product, current_dsrs, discount_percent)

    units_to_sell = sim["units_sold"]
    if units_to_sell <= 0:
        return jsonify({"error": "Simulation resulted in 0 units sold. No clearance applied."}), 400

    # Record clearance sale transaction
    sale = SaleTransaction(
        invoice_number=f"CLR-{int(date.today().strftime('%Y%m%d'))}-{product.id}",
        product_id=product.id,
        quantity=units_to_sell,
        unit_price=product.selling_price,
        discount_percent=discount_percent,
        total_amount=sim["recovered_capital"],
        sale_date=date.today(),
        channel="Clearance Campaign"
    )
    db.session.add(sale)

    # Update product stock & last sale date
    product.current_stock -= units_to_sell
    product.last_sale_date = date.today()

    db.session.commit()

    new_dsrs = calculate_dsrs(product)
    return jsonify({
        "message": f"Successfully applied {discount_percent}% clearance. Sold {units_to_sell} units and recovered ₹{sim['recovered_capital']:,.2f}.",
        "product": product.to_dict(),
        "new_dsrs": new_dsrs
    }), 200
