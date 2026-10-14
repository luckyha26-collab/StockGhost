from flask import Blueprint, request, jsonify
from database import db
from models import Recommendation, Product
from algorithms.dsrs import calculate_dsrs
from algorithms.recommendation import generate_recommendations

recommendation_bp = Blueprint('recommendation_bp', __name__)

@recommendation_bp.route('', methods=['GET'])
@recommendation_bp.route('/', methods=['GET'])
def get_recommendations():
    status = request.args.get('status')
    priority = request.args.get('priority')

    query = Recommendation.query
    if status:
        query = query.filter(Recommendation.status == status)
    if priority:
        query = query.filter(Recommendation.priority == priority)

    recs = query.order_by(Recommendation.id.desc()).all()
    return jsonify([r.to_dict() for r in recs]), 200

@recommendation_bp.route('/<int:rec_id>/status', methods=['PATCH'])
def update_status(rec_id):
    data = request.get_json() or {}
    new_status = data.get('status')
    rec = db.session.get(Recommendation, rec_id)
    if not rec:
        return jsonify({"error": "Recommendation not found"}), 404
    if new_status:
        rec.status = new_status
        db.session.commit()
    return jsonify(rec.to_dict()), 200

@recommendation_bp.route('/refresh', methods=['POST'])
def refresh_recommendations():
    try:
        Recommendation.query.filter(Recommendation.status == 'Pending').delete()
        
        products = Product.query.all()
        count = 0
        for p in products:
            res = calculate_dsrs(p)
            recs = generate_recommendations(p, res)
            for r in recs:
                if r["priority"] in ["Critical", "High"]:
                    rec_obj = Recommendation(
                        product_id=p.id,
                        action_type=r["action_type"],
                        title=r["title"],
                        details=r["details"],
                        expected_recovery=r["expected_recovery"],
                        discount_percent=r["discount_percent"],
                        priority=r["priority"],
                        status="Pending"
                    )
                    db.session.add(rec_obj)
                    count += 1

        db.session.commit()
        return jsonify({"message": f"Generated {count} fresh recovery recommendations."}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500
