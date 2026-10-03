import os
import time
import requests
from flask import Blueprint, request, jsonify
from werkzeug.utils import secure_filename
from google.cloud import firestore
from database import get_db
from auth_middleware import require_auth
from config import AVATARS_DIR, GEMINI_API_KEY, GEMINI_MODEL

user_routes = Blueprint("user_routes", __name__)

ALLOWED_IMAGE_EXTENSIONS = {"png", "jpg", "jpeg", "webp", "gif"}

def allowed_file(filename):
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_IMAGE_EXTENSIONS

@user_routes.get("/api/user/profile")
@require_auth
def get_user_profile():
    """Return the profile data of the currently signed-in user."""
    uid = request.uid
    db = get_db()
    doc = db.collection("users").document(uid).get()
    if not doc.exists:
        return jsonify(error="User profile not found"), 404

    profile = doc.to_dict()
    profile["id"] = uid
    return jsonify(user=profile)

@user_routes.put("/api/user/profile")
@require_auth
def update_user_profile():
    """Update user's profile details. If required fields are completed, sets profileCompleted=True."""
    uid = request.uid
    body = request.get_json(silent=True) or {}
    db = get_db()

    # Allowed update fields for users (never allow changing role or status)
    allowed_fields = ["name", "regNo", "branch", "year", "semester", "phone", "photoUrl", "notifications"]
    updates = {}
    for key in allowed_fields:
        if key in body:
            updates[key] = body[key] if key == "notifications" else (str(body[key]).strip() if body[key] is not None else "")

    # Check for profile completion criteria:
    # Must have name, regNo, branch, year, semester, phone AND photoUrl filled
    user_doc = db.collection("users").document(uid).get()
    existing = user_doc.to_dict() if user_doc.exists else {}

    merged = {**existing, **updates}
    has_name = bool(merged.get("name", "").strip())
    has_reg = bool(merged.get("regNo", "").strip())
    has_branch = bool(merged.get("branch", "").strip())
    has_year = bool(str(merged.get("year", "")).strip())
    has_sem = bool(str(merged.get("semester", "")).strip())
    has_phone = bool(merged.get("phone", "").strip())
    photo_str = str(merged.get("photoUrl", "")).strip()
    has_photo = bool(photo_str) and "flaticon.com" not in photo_str and "placeholder" not in photo_str.lower()

    if has_name and has_reg and has_branch and has_year and has_sem and has_phone and has_photo:
        updates["profileCompleted"] = True
    elif "profileCompleted" in body and body["profileCompleted"] is True and has_photo:
        updates["profileCompleted"] = True
    else:
        # If mandatory photo or fields are missing, profile is not complete
        updates["profileCompleted"] = False

    updates["updatedAt"] = firestore.SERVER_TIMESTAMP

    ref = db.collection("users").document(uid)
    ref.set(updates, merge=True)

    # Return refreshed profile
    updated_doc = ref.get().to_dict() or {}
    updated_doc["id"] = uid
    return jsonify({
        "message": "Profile updated successfully",
        "user": updated_doc
    })

import base64

@user_routes.post("/api/user/profile-photo")
@require_auth
def upload_profile_photo():
    """Upload and save a user profile photo securely. Auto-checks if profile is now completed."""
    uid = request.uid
    photo_url = None
    safe_name = None

    # 1. Handle multipart form file upload
    file = request.files.get("photo") or request.files.get("avatar") or request.files.get("file") or request.files.get("image")
    if file and file.filename != "":
        if not allowed_file(file.filename):
            return jsonify(error="Invalid file type. Allowed: PNG, JPG, JPEG, WEBP, GIF"), 400
        ext = file.filename.rsplit(".", 1)[1].lower()
        safe_name = f"{uid}_{int(time.time())}.{ext}"
        dest_path = os.path.join(AVATARS_DIR, safe_name)
        file.save(dest_path)
    else:
        # 2. Handle base64 JSON payload
        json_data = request.get_json(silent=True) or {}
        raw_b64 = json_data.get("photo_base64") or json_data.get("data_url") or json_data.get("photo") or ""
        if raw_b64 and "," in raw_b64:
            header, encoded = raw_b64.split(",", 1)
            ext = "png"
            if "jpeg" in header or "jpg" in header:
                ext = "jpg"
            elif "webp" in header:
                ext = "webp"
            safe_name = f"{uid}_{int(time.time())}.{ext}"
            dest_path = os.path.join(AVATARS_DIR, safe_name)
            try:
                with open(dest_path, "wb") as f:
                    f.write(base64.b64decode(encoded))
            except Exception as e:
                return jsonify(error=f"Failed to decode base64 photo: {str(e)}"), 400
        elif raw_b64.startswith("http"):
            photo_url = raw_b64

    if safe_name:
        # Build accessible URL on the backend
        host = request.host_url.rstrip("/")
        photo_url = f"{host}/uploads/avatars/{safe_name}"

    if not photo_url:
        return jsonify(error="No valid photo file or image data provided"), 400

    # Update in database using set with merge=True (creates doc if not exists, never throws 404)
    db = get_db()
    user_doc = db.collection("users").document(uid).get()
    existing = user_doc.to_dict() if user_doc.exists else {}

    has_name = bool((existing.get("name") or "").strip())
    has_reg = bool((existing.get("regNo") or "").strip())
    has_branch = bool((existing.get("branch") or "").strip())
    has_year = bool(str(existing.get("year") or "").strip())
    has_sem = bool(str(existing.get("semester") or "").strip())
    has_phone = bool((existing.get("phone") or "").strip())

    updates = {
        "photoUrl": photo_url,
        "updatedAt": firestore.SERVER_TIMESTAMP
    }
    if has_name and has_reg and has_branch and has_year and has_sem and has_phone:
        updates["profileCompleted"] = True

    db.collection("users").document(uid).set(updates, merge=True)

    updated_doc = db.collection("users").document(uid).get().to_dict() or {}
    updated_doc["id"] = uid

    return jsonify({
        "message": "Profile photo uploaded and updated successfully",
        "photoUrl": photo_url,
        "profileCompleted": updates.get("profileCompleted", False),
        "user": updated_doc
    })

@user_routes.get("/api/announcements")
def get_announcements():
    """Retrieve all official announcements published by administrators."""
    db = get_db()
    notices = []
    try:
        q = db.collection("announcements").order_by("createdAt", direction=firestore.Query.DESCENDING).limit(50)
        for doc in q.stream():
            data = doc.to_dict()
            ct = data.get("createdAt")
            created_str = ct.isoformat() if hasattr(ct, "isoformat") else str(ct or "")
            notices.append({
                "id": doc.id,
                **data,
                "createdAt": created_str
            })
    except Exception as exc:
        print("Announcements ordered fetch notice:", exc)
        for doc in db.collection("announcements").stream():
            data = doc.to_dict()
            notices.append({"id": doc.id, **data})

    return jsonify(announcements=notices, success=True)


@user_routes.get("/api/courses")
@require_auth
def get_courses():
    """Get all published courses for students."""
    db = get_db()
    courses = []
    for snapshot in db.collection("courses").stream():
        data = snapshot.to_dict()
        if data.get("status") == "published":
            courses.append({"id": snapshot.id, **data})
    courses.sort(key=lambda item: str(item.get("createdAt") or ""), reverse=True)
    return jsonify(courses=courses)

@user_routes.post("/api/ask")
@require_auth
def ask_ai():
    """SkillHub AI Tutor endpoint linked with Google Gemini."""
    body = request.get_json(silent=True) or {}
    question = (body.get("question") or "").strip()
    custom_key = (body.get("custom_key") or body.get("gemini_key") or "").strip()
    if not question:
        return jsonify(error="Question is required"), 400

    try:
        from services.ai_service import generate_ai_response
        res = generate_ai_response(question, custom_key=custom_key)
        if isinstance(res, dict):
            return jsonify(
                answer=res.get("answer"),
                model=res.get("model", "gemini-1.5-flash"),
                poweredBy=res.get("poweredBy", "Google Gemini"),
                isLiveGemini=res.get("isLiveGemini", False),
                geminiStatus=res.get("geminiStatus"),
                success=True
            )
        return jsonify(answer=res, success=True)
    except Exception as exc:
        return jsonify(
            answer="I am here to help you with your coursework, GATE exam prep, and programming concepts. Please try asking again!",
            error=str(exc)
        ), 200

@user_routes.get("/api/gemini/status")
@require_auth
def gemini_status():
    """Check Gemini configuration status."""
    import config
    key = os.environ.get("GEMINI_API_KEY") or config.GEMINI_API_KEY or ""
    has_key = bool(key and key.strip())
    masked = f"{key[:6]}...{key[-4:]}" if len(key) > 10 else ("Configured" if has_key else "Not set")
    return jsonify(
        configured=has_key,
        model=os.environ.get("GEMINI_MODEL") or config.GEMINI_MODEL or "gemini-1.5-flash",
        keyPreview=masked,
        success=True
    )

@user_routes.post("/api/gemini/config")
@require_auth
def configure_gemini():
    """Validate and persist Google Gemini API key."""
    body = request.get_json(silent=True) or {}
    key = (body.get("gemini_key") or "").strip()
    if not key:
        return jsonify(error="Gemini API key is required", success=False), 400

    import requests
    # Test key with Gemini generateContent endpoint
    test_url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={key}"
    try:
        test_payload = {
            "contents": [{"parts": [{"text": "Hello"}]}],
            "generationConfig": {"maxOutputTokens": 10}
        }
        resp = requests.post(test_url, json=test_payload, timeout=8)
        if resp.status_code != 200:
            return jsonify(
                error=f"Gemini API key verification failed (HTTP {resp.status_code}): {resp.text[:120]}",
                success=False
            ), 400
    except Exception as e:
        return jsonify(error=f"Connection error while verifying key: {str(e)}", success=False), 400

    # Key is valid; update live runtime
    os.environ["GEMINI_API_KEY"] = key
    import config
    config.GEMINI_API_KEY = key

    # Persist into backend/.env
    env_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".env")
    if os.path.exists(env_file):
        try:
            with open(env_file, "r", encoding="utf-8") as f:
                lines = f.readlines()
            replaced = False
            for i, line in enumerate(lines):
                if line.startswith("GEMINI_API_KEY="):
                    lines[i] = f"GEMINI_API_KEY={key}\n"
                    replaced = True
                    break
            if not replaced:
                lines.append(f"\nGEMINI_API_KEY={key}\n")
            with open(env_file, "w", encoding="utf-8") as f:
                f.writelines(lines)
        except Exception as e:
            print("Warning writing .env:", e)

    return jsonify(message="Google Gemini API key successfully linked and verified!", success=True)

