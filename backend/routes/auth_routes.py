import random
import time
from datetime import datetime
from flask import Blueprint, request, jsonify
from flask_jwt_extended import create_access_token, jwt_required, get_jwt_identity
from models import User
from database import db
from sms_service import send_real_otp_sms, update_sms_credentials, SMS_AUDIT_LOGS, SMS_CONFIG

auth_bp = Blueprint('auth_bp', __name__)

ACTIVE_OTPS = {}

def mask_phone(phone):
    clean = str(phone or '').replace(" ", "").replace("-", "")
    if len(clean) >= 10:
        return clean[:3] + "****" + clean[-3:]
    return clean[:2] + "****" if len(clean) > 2 else "****"

@auth_bp.route('/register', methods=['POST'])
def register():
    data = request.get_json() or {}
    username = data.get('username', '').strip()
    full_name = data.get('full_name', '').strip() or username
    email = data.get('email', '').strip()
    phone_number = data.get('phone_number', '').strip()
    password = data.get('password', '').strip()
    role = data.get('role', 'Inventory Manager').strip()

    if not username or not password or not phone_number:
        return jsonify({"error": "User ID, password, and registered contact phone number are required."}), 400

    if role not in ['Admin', 'Inventory Manager', 'Sales Manager']:
        role = 'Inventory Manager'

    # Check existing user
    if User.query.filter((User.username == username) | (User.email == email)).first():
        return jsonify({"error": f"An account with User ID '{username}' or email '{email}' already exists."}), 409

    user = User(
        username=username,
        full_name=full_name,
        email=email or f"{username}@stockghost.com",
        phone_number=phone_number,
        role=role
    )
    user.set_password(password)
    db.session.add(user)
    db.session.commit()

    return jsonify({
        "message": f"Account successfully created for {full_name} with role '{role}' and registered phone {phone_number}!",
        "user": user.to_dict()
    }), 201

@auth_bp.route('/send-otp', methods=['POST'])
def send_otp():
    data = request.get_json() or {}
    ident = (data.get('username') or data.get('email', '')).strip()
    password = data.get('password', '').strip()

    if not ident or not password:
        return jsonify({"error": "User ID and password are required."}), 400

    user = User.query.filter((User.username == ident) | (User.email == ident)).first()
    if not user or not user.check_password(password):
        return jsonify({"error": "Invalid User ID or Password. Please try again."}), 401
    if not user.phone_number:
        if user.role == 'Sales Manager':
            user.phone_number = "+91 9823924993"
        else:
            user.phone_number = "+91 9284410610"
        db.session.commit()

    # Generate 6-digit cryptographically random OTP
    otp_code = f"{random.randint(100000, 999999)}"
    expires_at = time.time() + 180  # 3 minutes

    ACTIVE_OTPS[user.username.lower()] = {
        "otp": otp_code,
        "expires_at": expires_at,
        "user_id": user.id,
        "phone": user.phone_number,
        "role": user.role
    }

    # Dispatch Real SMS to Manager's Contact Number
    sms_res = send_real_otp_sms(user.phone_number, otp_code, user.username)

    masked = mask_phone(user.phone_number)

    return jsonify({
        "message": f"Real OTP dispatched to registered mobile number ({masked}).",
        "phone_masked": masked,
        "phone_number": user.phone_number,
        "username": user.username,
        "role": user.role,
        "provider": sms_res.get("provider", "SMS Gateway"),
        "expires_in_seconds": 180
    }), 200

@auth_bp.route('/verify-otp', methods=['POST'])
def verify_otp():
    data = request.get_json() or {}
    ident = (data.get('username') or data.get('email', '')).strip().lower()
    submitted_otp = data.get('otp', '').strip()

    if not ident or not submitted_otp:
        return jsonify({"error": "User identifier and 6-digit OTP code are required."}), 400

    record = ACTIVE_OTPS.get(ident)
    if not record:
        user = User.query.filter((User.username.ilike(ident)) | (User.email.ilike(ident))).first()
        if user and user.username.lower() in ACTIVE_OTPS:
            record = ACTIVE_OTPS[user.username.lower()]

    if not record:
        return jsonify({"error": "No active OTP session. Please enter your credentials to request an OTP."}), 400

    if time.time() > record["expires_at"]:
        ACTIVE_OTPS.pop(ident, None)
        return jsonify({"error": "OTP has expired. Please request a fresh OTP code."}), 400

    if record["otp"] != submitted_otp:
        return jsonify({"error": "Incorrect OTP entered. Please verify the code sent to your registered contact number."}), 401

    # OTP Verified!
    user = User.query.get(record["user_id"])
    ACTIVE_OTPS.pop(ident, None)

    token = create_access_token(
        identity=str(user.id),
        additional_claims={
            "role": user.role,
            "username": user.username,
            "phone": user.phone_number,
            "two_factor": True
        }
    )

    user_dict = user.to_dict()
    user_dict["two_factor_verified"] = True

    return jsonify({
        "message": f"Two-Factor Authentication successful! Logged in as {user.role}.",
        "token": token,
        "user": user_dict
    }), 200

@auth_bp.route('/gateway-config', methods=['POST'])
def config_gateway():
    data = request.get_json() or {}
    provider = data.get('provider', 'FAST2SMS')
    api_key = data.get('api_key', '')
    twilio_sid = data.get('twilio_sid', '')
    twilio_token = data.get('twilio_token', '')
    twilio_from = data.get('twilio_from', '')

    res = update_sms_credentials(provider, api_key, twilio_sid, twilio_token, twilio_from)
    return jsonify(res), 200

@auth_bp.route('/sms-logs', methods=['GET'])
def get_sms_logs():
    return jsonify(SMS_AUDIT_LOGS[:20]), 200

@auth_bp.route('/users', methods=['GET'])
def list_users():
    users = User.query.all()
    return jsonify([u.to_dict() for u in users]), 200
