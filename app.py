"""
SkillHub backend — Flask + Firebase Admin SDK.

This replaces the old Node/Express server (server.js) and turns the
"Add Instructor", "Edit user", "Block/Unblock", "Delete", and
"Upload Video" buttons in admindashboard.html from fake/static UI into
real, working features backed by Firebase Auth + Firestore.

Run it with:
    pip install -r requirements.txt
    cp .env.example .env        # fill in your values
    python app.py

It serves the whole site (index.html, dashboard.html, admindashboard.html,
assets/, pdfs/, uploads/) AND the /api/* backend from one process, so you
only need to run one command.
"""

import os
import uuid
import mimetypes
from functools import wraps
from datetime import datetime

from flask import Flask, request, jsonify, send_from_directory, abort
from werkzeug.utils import secure_filename
from dotenv import load_dotenv

import firebase_admin
from firebase_admin import credentials, auth as fb_auth, firestore

load_dotenv()

# ---------------------------------------------------------------------------
# Firebase Admin init
# ---------------------------------------------------------------------------
SERVICE_ACCOUNT_PATH = os.environ.get("FIREBASE_SERVICE_ACCOUNT_KEY", "serviceAccountKey.json")

if not os.path.exists(SERVICE_ACCOUNT_PATH):
    raise RuntimeError(
        f"Firebase service account file not found at '{SERVICE_ACCOUNT_PATH}'.\n"
        "Go to Firebase Console -> Project Settings -> Service Accounts -> "
        "Generate new private key, save the JSON as serviceAccountKey.json in "
        "the project root (or set FIREBASE_SERVICE_ACCOUNT_KEY in .env), and "
        "never commit that file to git."
    )

cred = credentials.Certificate(SERVICE_ACCOUNT_PATH)
firebase_admin.initialize_app(cred)
db = firestore.client()

# ---------------------------------------------------------------------------
# Flask app — also serves the static frontend
# ---------------------------------------------------------------------------
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
UPLOAD_DIR = os.path.join(BASE_DIR, "uploads", "videos")
os.makedirs(UPLOAD_DIR, exist_ok=True)

ALLOWED_VIDEO_EXT = {"mp4", "webm", "ogg", "mov", "mkv"}
MAX_VIDEO_BYTES = 500 * 1024 * 1024  # 500 MB per video

app = Flask(__name__, static_folder=BASE_DIR, static_url_path="")
app.config["MAX_CONTENT_LENGTH"] = MAX_VIDEO_BYTES + 5 * 1024 * 1024


def allowed_video(filename):
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_VIDEO_EXT


# ---------------------------------------------------------------------------
# Auth: every /api/admin/* route requires a valid Firebase ID token
# (sent from the browser as `Authorization: Bearer <idToken>`) belonging
# to a user whose Firestore users/{uid}.role == "admin". This mirrors the
# same rule already enforced in firestore.rules, so the backend and the
# database rules agree with each other.
# ---------------------------------------------------------------------------
def require_admin(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        header = request.headers.get("Authorization", "")
        if not header.startswith("Bearer "):
            return jsonify(error="Missing Authorization: Bearer <idToken> header"), 401
        id_token = header.split(" ", 1)[1]
        try:
            decoded = fb_auth.verify_id_token(id_token)
        except Exception as e:
            return jsonify(error=f"Invalid or expired token: {e}"), 401

        uid = decoded["uid"]
        profile_ref = db.collection("users").document(uid)
        profile = profile_ref.get()
        if not profile.exists or profile.to_dict().get("role") != "admin":
            return jsonify(error="Admin role required"), 403

        request.admin_uid = uid
        return fn(*args, **kwargs)

    return wrapper


# ---------------------------------------------------------------------------
# Users: list / create instructor / create student / edit / block / delete
# ---------------------------------------------------------------------------
@app.get("/api/admin/users")
@require_admin
def list_users():
    """?role=student|instructor|admin  (omit for everyone)"""
    role_filter = request.args.get("role")
    query = db.collection("users")
    if role_filter:
        query = query.where("role", "==", role_filter)
    docs = query.stream()
    users = []
    for d in docs:
        data = d.to_dict()
        data["id"] = d.id
        users.append(data)
    users.sort(key=lambda u: u.get("createdAt") or 0, reverse=True)
    return jsonify(users=users)


def _create_platform_user(payload, role):
    name = (payload.get("name") or "").strip()
    email = (payload.get("email") or "").strip().lower()
    password = payload.get("password") or ""

    if not name or not email:
        return None, (jsonify(error="name and email are required"), 400)
    if not password or len(password) < 6:
        return None, (jsonify(error="password must be at least 6 characters"), 400)

    try:
        user_record = fb_auth.create_user(
            email=email, password=password, display_name=name
        )
    except fb_auth.EmailAlreadyExistsError:
        return None, (jsonify(error="A user with that email already exists"), 409)
    except Exception as e:
        return None, (jsonify(error=str(e)), 400)

    profile = {
        "name": name,
        "email": email,
        "role": role,
        "status": "active",
        "createdAt": firestore.SERVER_TIMESTAMP,
    }
    if role == "instructor":
        profile["expertise"] = payload.get("expertise", "")
        profile["bio"] = payload.get("bio", "")
        profile["courses"] = 0
        profile["rating"] = 0
    if role == "student":
        profile["branch"] = payload.get("branch", "")

    db.collection("users").document(user_record.uid).set(profile)
    profile["id"] = user_record.uid
    return profile, None


@app.post("/api/admin/instructors")
@require_admin
def create_instructor():
    profile, err = _create_platform_user(request.get_json(force=True) or {}, "instructor")
    if err:
        return err
    return jsonify(user=profile), 201


@app.post("/api/admin/students")
@require_admin
def create_student():
    profile, err = _create_platform_user(request.get_json(force=True) or {}, "student")
    if err:
        return err
    return jsonify(user=profile), 201


@app.put("/api/admin/users/<uid>")
@require_admin
def edit_user(uid):
    body = request.get_json(force=True) or {}
    ref = db.collection("users").document(uid)
    snap = ref.get()
    if not snap.exists:
        return jsonify(error="User not found"), 404

    editable_fields = {"name", "email", "branch", "expertise", "bio", "role", "rating", "courses"}
    updates = {k: v for k, v in body.items() if k in editable_fields}
    if not updates:
        return jsonify(error="No editable fields supplied"), 400

    # Keep Firebase Auth email/display name in sync if changed
    auth_updates = {}
    if "email" in updates:
        auth_updates["email"] = updates["email"]
    if "name" in updates:
        auth_updates["display_name"] = updates["name"]
    if auth_updates:
        try:
            fb_auth.update_user(uid, **auth_updates)
        except Exception as e:
            return jsonify(error=f"Firebase Auth update failed: {e}"), 400

    ref.update(updates)
    updated = ref.get().to_dict()
    updated["id"] = uid
    return jsonify(user=updated)


@app.post("/api/admin/users/<uid>/block")
@require_admin
def toggle_block(uid):
    ref = db.collection("users").document(uid)
    snap = ref.get()
    if not snap.exists:
        return jsonify(error="User not found"), 404

    current = snap.to_dict().get("status", "active")
    new_status = "active" if current == "blocked" else "blocked"

    # Real enforcement: a blocked user's Firebase Auth account is disabled,
    # so they are rejected at sign-in, not just hidden in the UI.
    try:
        fb_auth.update_user(uid, disabled=(new_status == "blocked"))
    except Exception as e:
        return jsonify(error=f"Firebase Auth update failed: {e}"), 400

    ref.update({"status": new_status})
    return jsonify(id=uid, status=new_status)


@app.delete("/api/admin/users/<uid>")
@require_admin
def delete_user(uid):
    if uid == request.admin_uid:
        return jsonify(error="You cannot delete your own admin account"), 400

    ref = db.collection("users").document(uid)
    if not ref.get().exists:
        return jsonify(error="User not found"), 404

    try:
        fb_auth.delete_user(uid)
    except fb_auth.UserNotFoundError:
        pass  # already gone from Auth, still clean up Firestore below
    except Exception as e:
        return jsonify(error=f"Firebase Auth delete failed: {e}"), 400

    ref.delete()
    return jsonify(id=uid, deleted=True)


# ---------------------------------------------------------------------------
# Video library: real file upload / drag-drop instead of a YouTube link.
# Files are stored on disk under uploads/videos/ and served back statically;
# metadata (title, description, section, branch, fileUrl, sizeBytes) is
# written to Firestore's library_videos collection, same collection the
# YouTube-link videos already live in — just with type:"upload" and a
# local fileUrl instead of a `url` (YouTube) field.
# ---------------------------------------------------------------------------
@app.post("/api/admin/videos/upload")
@require_admin
def upload_video():
    if "file" not in request.files:
        return jsonify(error="No file part named 'file' in the request"), 400
    file = request.files["file"]
    if file.filename == "":
        return jsonify(error="No file selected"), 400
    if not allowed_video(file.filename):
        return jsonify(error=f"Unsupported file type. Allowed: {', '.join(sorted(ALLOWED_VIDEO_EXT))}"), 400

    title = (request.form.get("title") or file.filename).strip()
    description = request.form.get("description", "")
    section = request.form.get("section", "General")
    branch = request.form.get("branch", "")

    ext = file.filename.rsplit(".", 1)[1].lower()
    stored_name = f"{uuid.uuid4().hex}.{ext}"
    safe_name = secure_filename(stored_name)
    dest_path = os.path.join(UPLOAD_DIR, safe_name)
    file.save(dest_path)
    size_bytes = os.path.getsize(dest_path)

    doc_ref = db.collection("library_videos").document()
    doc_ref.set(
        {
            "title": title,
            "description": description,
            "section": section,
            "branch": branch,
            "type": "upload",
            "fileUrl": f"/uploads/videos/{safe_name}",
            "sizeBytes": size_bytes,
            "addedAt": firestore.SERVER_TIMESTAMP,
        }
    )

    return (
        jsonify(
            id=doc_ref.id,
            fileUrl=f"/uploads/videos/{safe_name}",
            sizeBytes=size_bytes,
            title=title,
        ),
        201,
    )


@app.delete("/api/admin/videos/<video_id>")
@require_admin
def delete_video(video_id):
    ref = db.collection("library_videos").document(video_id)
    snap = ref.get()
    if not snap.exists:
        return jsonify(error="Video not found"), 404
    data = snap.to_dict()
    file_url = data.get("fileUrl")
    if file_url and file_url.startswith("/uploads/videos/"):
        disk_path = os.path.join(BASE_DIR, file_url.lstrip("/"))
        if os.path.exists(disk_path):
            os.remove(disk_path)
    ref.delete()
    return jsonify(id=video_id, deleted=True)


@app.get("/uploads/videos/<path:filename>")
def serve_video(filename):
    # Range-request support so the <video> tag can seek/scrub, which
    # send_from_directory handles for us out of the box in modern Flask.
    return send_from_directory(UPLOAD_DIR, filename, conditional=True)


# ---------------------------------------------------------------------------
# Health check + static frontend fallback
# ---------------------------------------------------------------------------
@app.get("/api/health")
def health():
    return jsonify(status="ok", time=datetime.utcnow().isoformat())


@app.errorhandler(404)
def not_found(e):
    if request.path.startswith("/api/"):
        return jsonify(error="Not found"), 404
    # Let the static file handler try index.html for plain page paths.
    index_path = os.path.join(BASE_DIR, "index.html")
    if os.path.exists(index_path):
        return send_from_directory(BASE_DIR, "index.html")
    abort(404)


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=True)
