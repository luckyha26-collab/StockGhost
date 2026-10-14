import os
import sys

# Ensure backend root is in python module path
sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))

from flask import Flask, jsonify, send_from_directory
from flask_cors import CORS
from flask_jwt_extended import JWTManager
from config import Config
from database import db
from seed_data import seed_database

# Blueprints
from routes.auth_routes import auth_bp
from routes.inventory_routes import inventory_bp
from routes.analytics_routes import analytics_bp
from routes.simulation_routes import simulation_bp
from routes.chatbot_routes import chatbot_bp
from routes.recommendation_routes import recommendation_bp

def create_app():
    app = Flask(__name__, static_folder='../frontend/dist', static_url_path='')
    app.config.from_object(Config)
    app.url_map.strict_slashes = False

    # Enable CORS for frontend clients
    CORS(app, resources={r"/api/*": {"origins": "*"}})

    # Init database and JWT
    db.init_app(app)
    jwt = JWTManager(app)

    # Register blueprints
    app.register_blueprint(auth_bp, url_prefix='/api/auth')
    app.register_blueprint(inventory_bp, url_prefix='/api')
    app.register_blueprint(analytics_bp, url_prefix='/api/analytics')
    app.register_blueprint(simulation_bp, url_prefix='/api/simulation')
    app.register_blueprint(chatbot_bp, url_prefix='/api/chatbot')
    app.register_blueprint(recommendation_bp, url_prefix='/api/recommendations')

    with app.app_context():
        try:
            db.create_all()
            seed_database()
        except Exception as e:
            print(f"Database initialization note: {e}")

    @app.route('/api/health', methods=['GET'])
    def health_check():
        return jsonify({
            "status": "healthy",
            "system": "StockGhost ERP - Dead Stock & Blocked Capital Detection",
            "version": "1.0.0",
            "port": 5050
        })

    # Catch-all endpoint
    @app.route('/', defaults={'path': ''})
    @app.route('/<path:path>')
    def serve_frontend(path):
        dist_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '../frontend/dist'))
        if path != "" and os.path.exists(os.path.join(dist_dir, path)):
            return send_from_directory(dist_dir, path)
        if os.path.exists(os.path.join(dist_dir, 'index.html')):
            return send_from_directory(dist_dir, 'index.html')
        return jsonify({
            "message": "StockGhost API is running on port 5050.",
            "api_health": "/api/health",
            "docs": "Start frontend with 'npm run dev' on port 5173."
        })

    return app

app = create_app()

if __name__ == '__main__':
    port = int(os.getenv('PORT', 5050))
    print(f"==================================================")
    print(f"🚀 StockGhost Backend running on http://127.0.0.1:{port}")
    print(f"   API Health Check: http://127.0.0.1:{port}/api/health")
    print(f"==================================================")
    app.run(host='0.0.0.0', port=port, debug=True)
