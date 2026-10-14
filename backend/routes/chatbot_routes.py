from flask import Blueprint, request, jsonify
from models import Product
from chatbot.intent_engine import InventoryChatbot

chatbot_bp = Blueprint('chatbot_bp', __name__)

@chatbot_bp.route('/query', methods=['POST'])
def handle_chatbot_query():
    data = request.get_json() or {}
    user_message = data.get('message', '').strip()

    products = Product.query.all()
    bot = InventoryChatbot(products)
    response = bot.process_query(user_message)

    return jsonify(response), 200
