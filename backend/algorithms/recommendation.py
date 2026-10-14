def generate_recommendations(product, dsrs_result):
    """
    Rule-based recommendation engine for inventory recovery:
    Generates actionable strategies (Discount, Bundling, Liquidation, Return to Supplier)
    based on product DSRS score, margin, stock age, and capital exposure.
    """
    recs = []
    score = dsrs_result["score"]
    tier = dsrs_result["tier"]
    stock = product.current_stock
    cost_price = product.cost_price
    selling_price = product.selling_price
    inv_value = stock * cost_price
    margin_pct = ((selling_price - cost_price) / selling_price) * 100 if selling_price > 0 else 0
    days_since_sale = dsrs_result["days_since_last_sale"]

    if tier == "Dead Stock":
        # Action 1: Clearance Discount
        rec_discount = 25.0
        # If margin is wide, can discount up to 35%
        if margin_pct > 30:
            rec_discount = 30.0
            
        discounted_price = selling_price * (1.0 - rec_discount / 100.0)
        # Expected clearance: ~70%
        est_sold = int(stock * 0.70)
        expected_recovery = round(est_sold * discounted_price, 2)
        
        recs.append({
            "action_type": "Clearance Discount",
            "title": f"Execute {int(rec_discount)}% Flash Clearance Sale",
            "details": f"Apply a {int(rec_discount)}% discount to liquidate approximately {est_sold} of {stock} stagnant units. This will inject ₹{expected_recovery:,.2f} directly back into operating cash flow and eliminate holding costs.",
            "discount_percent": rec_discount,
            "expected_recovery": expected_recovery,
            "priority": "Critical" if score >= 90 else "High",
            "status": "Recommended"
        })

        # Action 2: Return to Supplier (if recent enough or agreement in place)
        supplier = getattr(product, 'supplier', None)
        supplier_name = supplier.name if supplier else "Supplier"
        recs.append({
            "action_type": "Return to Supplier",
            "title": f"Initiate RMA / Buyback Request with {supplier_name}",
            "details": f"Contact {supplier_name} to negotiate return or exchange for fast-moving SKUs. Even a 10-15% restocking fee saves ₹{inv_value * 0.85:,.2f} in blocked capital.",
            "discount_percent": 0.0,
            "expected_recovery": round(inv_value * 0.85, 2),
            "priority": "High",
            "status": "Recommended"
        })

        # Action 3: B2B Liquidation / Bulk Clearance
        if days_since_sale >= 150:
            recs.append({
                "action_type": "Liquidation",
                "title": "Offload to Third-Party B2B Liquidators",
                "details": f"Package remaining {stock} units for bulk liquidation at cost or near-cost (₹{cost_price:,.2f}/unit) to immediately free up prime warehouse shelf space.",
                "discount_percent": 40.0,
                "expected_recovery": round(inv_value * 0.70, 2),
                "priority": "Medium",
                "status": "Alternative"
            })

    elif tier == "High Risk":
        # Action 1: Bundling Strategy
        recs.append({
            "action_type": "Bundling",
            "title": "Bundle with Best-Selling Category Companion",
            "details": f"Pair {product.name} with top-performing fast-moving products as a value bundle at a 15% promotional bundle discount to stimulate conversion.",
            "discount_percent": 15.0,
            "expected_recovery": round(inv_value * 0.60, 2),
            "priority": "High",
            "status": "Recommended"
        })

        # Action 2: Targeted Promotional Discount
        recs.append({
            "action_type": "Clearance Discount",
            "title": "Targeted 15-20% Weekend Promo",
            "details": f"Run a limited-time 20% discount marketing push across retail and web channels to accelerate sell-through before hitting dead stock status.",
            "discount_percent": 20.0,
            "expected_recovery": round(stock * 0.50 * (selling_price * 0.80), 2),
            "priority": "Medium",
            "status": "Recommended"
        })

    elif tier == "Slow Moving":
        recs.append({
            "action_type": "Repositioning",
            "title": "Feature in Promotional Displays & Digital Catalog",
            "details": f"Re-merchandise {product.name} on the website homepage and retail front-bays. Introduce a 10% coupon code to increase sales velocity.",
            "discount_percent": 10.0,
            "expected_recovery": round(inv_value * 0.40, 2),
            "priority": "Low",
            "status": "Suggested"
        })
        recs.append({
            "action_type": "Procurement Adjustment",
            "title": "Freeze Procurement Reorders",
            "details": f"Current turnover indicates sufficient stock runway. Pause new purchase orders for {product.name} until inventory drops below minimum threshold ({product.min_stock} units).",
            "discount_percent": 0.0,
            "expected_recovery": 0.0,
            "priority": "Medium",
            "status": "Suggested"
        })

    else:
        # Healthy
        recs.append({
            "action_type": "Maintain",
            "title": "Inventory Levels Healthy",
            "details": f"{product.name} is performing well with balanced turnover and minimal dead stock risk. Continue regular inventory monitoring and reorder schedule.",
            "discount_percent": 0.0,
            "expected_recovery": 0.0,
            "priority": "Info",
            "status": "Optimal"
        })

    return recs
