from flask import Blueprint, jsonify
from models import Product, Category
from algorithms.dsrs import calculate_dsrs

analytics_bp = Blueprint('analytics_bp', __name__)

@analytics_bp.route('/dashboard', methods=['GET'])
def get_dashboard_metrics():
    products = Product.query.all()
    
    total_val = 0.0
    total_blocked = 0.0
    tier_counts = {
        "Healthy": 0,
        "Slow Moving": 0,
        "High Risk": 0,
        "Dead Stock": 0
    }
    
    total_dsrs_sum = 0
    ranked_products = []

    for p in products:
        val = p.current_stock * p.cost_price
        total_val += val
        
        dsrs_info = calculate_dsrs(p)
        tier = dsrs_info["tier"]
        tier_counts[tier] = tier_counts.get(tier, 0) + 1
        total_dsrs_sum += dsrs_info["score"]

        if dsrs_info["is_blocked"]:
            total_blocked += val

        ranked_products.append({
            "id": p.id,
            "sku": p.sku,
            "name": p.name,
            "category": p.category.name if p.category else "General",
            "current_stock": p.current_stock,
            "cost_price": p.cost_price,
            "inventory_value": val,
            "dsrs_score": dsrs_info["score"],
            "tier": tier,
            "stock_age_days": dsrs_info["stock_age_days"],
            "days_since_last_sale": dsrs_info["days_since_last_sale"]
        })

    # Sort descending by inventory value of blocked capital
    ranked_products.sort(key=lambda x: (1 if x["tier"] in ["Dead Stock", "High Risk"] else 0, x["inventory_value"]), reverse=True)

    total_skus = len(products)
    avg_dsrs = round(total_dsrs_sum / total_skus, 1) if total_skus > 0 else 0
    blocked_percent = round((total_blocked / total_val * 100), 1) if total_val > 0 else 0

    return jsonify({
        "total_inventory_value": round(total_val, 2),
        "total_blocked_capital": round(total_blocked, 2),
        "blocked_capital_percent": blocked_percent,
        "total_skus": total_skus,
        "average_dsrs": avg_dsrs,
        "tier_counts": tier_counts,
        "top_risky_products": ranked_products[:6]
    }), 200

@analytics_bp.route('/category-breakdown', methods=['GET'])
def get_category_breakdown():
    categories = Category.query.all()
    data = []

    for cat in categories:
        cat_val = 0.0
        cat_blocked = 0.0
        dead_count = 0
        
        for p in cat.products:
            val = p.current_stock * p.cost_price
            cat_val += val
            res = calculate_dsrs(p)
            if res["is_blocked"]:
                cat_blocked += val
            if res["tier"] == "Dead Stock":
                dead_count += 1
                
        data.append({
            "category_id": cat.id,
            "category_name": cat.name,
            "total_value": round(cat_val, 2),
            "blocked_capital": round(cat_blocked, 2),
            "dead_stock_items": dead_count
        })

    return jsonify(data), 200
