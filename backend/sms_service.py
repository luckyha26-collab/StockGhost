"""
StockGhost ERP 2.0 - SMS & OTP Service Deprecated
==================================================
The SMS OTP verification system has been permanently deprecated per requirements.
All enterprise access is governed strictly by Admin-Provisioned User ID & Password
Role-Based Access Control (RBAC).
"""

def send_real_otp_sms(*args, **kwargs):
    return {"success": False, "message": "OTP verification system has been disabled."}
