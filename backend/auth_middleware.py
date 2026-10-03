from functools import wraps
from flask import request, jsonify
from google.cloud import firestore
from database import get_admin_auth, get_db

def _extract_token():
    header = request.headers.get("Authorization", "")
    if not header.startswith("Bearer "):
        return None
    return header.split(" ", 1)[1].strip()

def get_current_user_profile(uid):
    db = get_db()
    doc = db.collection("users").document(uid).get()
    if doc.exists:
        data = doc.to_dict()
        data["id"] = doc.id
        return data
    return None

def require_auth(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        token = _extract_token()
        if not token:
            return jsonify(error="Authentication token is required"), 401
        
        try:
            admin_auth = get_admin_auth()
            decoded = admin_auth.verify_id_token(token)
            request.uid = decoded["uid"]
            request.token_data = decoded
            
            profile = get_current_user_profile(decoded["uid"])
            request.user_profile = profile
        except Exception as exc:
            return jsonify(error="Invalid or expired token", details=str(exc)), 401
            
        return fn(*args, **kwargs)
    return wrapper

def require_admin(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        token = _extract_token()
        if not token:
            return jsonify(error="Authentication token is required"), 401
        
        try:
            admin_auth = get_admin_auth()
            decoded = admin_auth.verify_id_token(token)
            uid = decoded["uid"]
            request.uid = uid
            request.token_data = decoded
            
            profile = get_current_user_profile(uid)
            if not profile:
                return jsonify(error="User record not found"), 403
                
            role = profile.get("role", "")
            if role != "admin":
                return jsonify(error="403 Forbidden: Administrator access required"), 403
                
            if profile.get("status") == "blocked":
                return jsonify(error="Admin account is blocked"), 403
                
            request.user_profile = profile
        except Exception as exc:
            return jsonify(error="Authorization failed", details=str(exc)), 401
            
        return fn(*args, **kwargs)
    return wrapper

def require_user(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        token = _extract_token()
        if not token:
            return jsonify(error="Authentication token is required"), 401
        
        try:
            admin_auth = get_admin_auth()
            decoded = admin_auth.verify_id_token(token)
            uid = decoded["uid"]
            request.uid = uid
            request.token_data = decoded
            
            profile = get_current_user_profile(uid)
            if not profile:
                # Create default user profile if first time
                db = get_db()
                default_profile = {
                    "name": decoded.get("name") or "",
                    "email": decoded.get("email") or "",
                    "role": "user",
                    "status": "active",
                    "profileCompleted": False,
                    "createdAt": firestore.SERVER_TIMESTAMP if 'firestore' in globals() else None
                }
                db.collection("users").document(uid).set(default_profile)
                profile = {"id": uid, **default_profile}
                
            if profile.get("status") == "blocked":
                return jsonify(error="Your account has been suspended. Please contact administration."), 403
                
            request.user_profile = profile
        except Exception as exc:
            return jsonify(error="Authentication failed", details=str(exc)), 401
            
        return fn(*args, **kwargs)
    return wrapper
