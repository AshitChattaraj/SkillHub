import os
import requests
from flask import Blueprint, request, jsonify
from google.cloud import firestore
from database import get_db, get_admin_auth
from auth_middleware import require_auth
from config import FIREBASE_WEB_API_KEY

auth_routes = Blueprint("auth_routes", __name__)

@auth_routes.post("/api/auth/signup")
def signup():
    """Create a new user account with role='user' and profileCompleted=False."""
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    name = (data.get("name") or "").strip()

    if not email:
        return jsonify(error="Email is required"), 400
    if len(password) < 6:
        return jsonify(error="Password must be at least 6 characters"), 400
    if not name:
        return jsonify(error="Full name is required"), 400

    admin_auth = get_admin_auth()
    db = get_db()

    try:
        user_record = admin_auth.create_user(
            email=email,
            password=password,
            display_name=name,
            email_verified=False
        )
    except Exception as exc:
        err_msg = str(exc)
        if "EMAIL_EXISTS" in err_msg or "already exists" in err_msg:
            return jsonify(error="An account with this email already exists"), 409
        return jsonify(error=f"Could not create account: {err_msg}"), 400

    uid = user_record.uid
    new_profile = {
        "name": name,
        "email": email,
        "role": "user",
        "status": "active",
        "profileCompleted": False,
        "regNo": "",
        "branch": "",
        "year": "",
        "semester": "",
        "phone": "",
        "photoUrl": "",
        "createdAt": firestore.SERVER_TIMESTAMP,
    }

    try:
        db.collection("users").document(uid).set(new_profile)
    except Exception as exc:
        # Rollback auth if Firestore fails
        admin_auth.delete_user(uid)
        return jsonify(error=f"Failed to initialize profile: {exc}"), 500

    return jsonify({
        "message": "User registered successfully",
        "uid": uid,
        "user": {
            "id": uid,
            "name": name,
            "email": email,
            "role": "user",
            "profileCompleted": False,
            "status": "active"
        }
    }), 201

@auth_routes.post("/api/auth/login")
def login():
    """Sign in using email/password via Firebase Auth REST API."""
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    if not email or not password:
        return jsonify(error="Email and password are required"), 400

    url = f"https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key={FIREBASE_WEB_API_KEY}"
    payload = {
        "email": email,
        "password": password,
        "returnSecureToken": True
    }

    try:
        resp = requests.post(url, json=payload, timeout=10)
        auth_data = resp.json()
    except Exception as exc:
        return jsonify(error=f"Authentication service error: {exc}"), 502

    if resp.status_code != 200:
        err_code = auth_data.get("error", {}).get("message", "INVALID_LOGIN_CREDENTIALS")
        if "EMAIL_NOT_FOUND" in err_code or "INVALID_PASSWORD" in err_code or "INVALID_LOGIN_CREDENTIALS" in err_code:
            return jsonify(error="Invalid email or password"), 401
        if "USER_DISABLED" in err_code:
            return jsonify(error="This account has been disabled"), 403
        return jsonify(error=err_code), 400

    uid = auth_data["localId"]
    id_token = auth_data["idToken"]
    refresh_token = auth_data.get("refreshToken")

    db = get_db()
    user_doc = db.collection("users").document(uid).get()
    
    if not user_doc.exists:
        # Self-heal profile
        profile = {
            "name": auth_data.get("displayName") or "",
            "email": email,
            "role": "user",
            "status": "active",
            "profileCompleted": False,
            "regNo": "",
            "branch": "",
            "year": "",
            "semester": "",
            "phone": "",
            "photoUrl": "",
            "createdAt": firestore.SERVER_TIMESTAMP
        }
        db.collection("users").document(uid).set(profile)
    else:
        profile = user_doc.to_dict()

    if profile.get("status") == "blocked":
        return jsonify(error="Your account has been suspended. Please contact administrator."), 403

    return jsonify({
        "message": "Login successful",
        "token": id_token,
        "refreshToken": refresh_token,
        "user": {
            "id": uid,
            "email": email,
            "name": profile.get("name", ""),
            "role": profile.get("role", "user"),
            "profileCompleted": bool(profile.get("profileCompleted", False)),
            "status": profile.get("status", "active"),
            "regNo": profile.get("regNo", ""),
            "branch": profile.get("branch", ""),
            "year": profile.get("year", ""),
            "semester": profile.get("semester", ""),
            "phone": profile.get("phone", ""),
            "photoUrl": profile.get("photoUrl", "")
        }
    })

@auth_routes.post("/api/auth/logout")
def logout():
    """Log out confirmation."""
    return jsonify({"message": "Logged out successfully"})

@auth_routes.get("/api/auth/me")
@require_auth
def get_me():
    """Return currently authenticated user information."""
    profile = request.user_profile or {}
    return jsonify({
        "user": {
            "id": request.uid,
            "name": profile.get("name", ""),
            "email": profile.get("email", ""),
            "role": profile.get("role", "user"),
            "profileCompleted": bool(profile.get("profileCompleted", False)),
            "status": profile.get("status", "active"),
            "regNo": profile.get("regNo", ""),
            "branch": profile.get("branch", ""),
            "year": profile.get("year", ""),
            "semester": profile.get("semester", ""),
            "phone": profile.get("phone", ""),
            "photoUrl": profile.get("photoUrl", "")
        }
    })
