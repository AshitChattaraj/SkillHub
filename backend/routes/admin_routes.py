import os
import time
from flask import Blueprint, request, jsonify
from werkzeug.utils import secure_filename
from google.cloud import firestore
from database import get_db, get_admin_auth
from auth_middleware import require_admin
from config import VIDEOS_DIR

admin_routes = Blueprint("admin_routes", __name__)

@admin_routes.get("/api/admin/users")
@require_admin
def list_admin_users():
    """List all registered users with filtering by branch, year, semester, status, and search."""
    db = get_db()
    branch_filter = (request.args.get("branch") or "").strip()
    year_filter = (request.args.get("year") or "").strip()
    sem_filter = (request.args.get("semester") or "").strip()
    status_filter = (request.args.get("status") or "").strip().lower()
    role_filter = (request.args.get("role") or "").strip().lower()
    search = (request.args.get("search") or "").strip().lower()

    users = []
    for snapshot in db.collection("users").stream():
        data = snapshot.to_dict()
        uid = snapshot.id
        user_obj = {
            "id": uid,
            "name": data.get("name", ""),
            "email": data.get("email", ""),
            "role": data.get("role", "user"),
            "status": data.get("status", "active"),
            "profileCompleted": bool(data.get("profileCompleted", False)),
            "regNo": data.get("regNo", ""),
            "branch": data.get("branch", ""),
            "year": str(data.get("year", "")),
            "semester": str(data.get("semester", "")),
            "phone": data.get("phone", ""),
            "photoUrl": data.get("photoUrl", ""),
            "createdAt": str(data.get("createdAt", "")),
        }

        # Apply Filters
        if branch_filter and branch_filter.lower() != "all":
            if user_obj["branch"].lower() != branch_filter.lower():
                continue

        if year_filter and year_filter.lower() != "all":
            # Support "1", "1st Year", etc.
            y = user_obj["year"].lower()
            if year_filter.lower() not in y and y not in year_filter.lower():
                continue

        if sem_filter and sem_filter.lower() != "all":
            s = user_obj["semester"].lower()
            if sem_filter.lower() != s and f"sem {sem_filter}" not in s and f"semester {sem_filter}" not in s:
                continue

        if status_filter and status_filter != "all":
            if status_filter == "completed":
                if not user_obj["profileCompleted"]:
                    continue
            elif status_filter == "incomplete":
                if user_obj["profileCompleted"]:
                    continue
            elif user_obj["status"].lower() != status_filter:
                continue

        if role_filter and role_filter != "all":
            # Map user/student synonym
            u_role = user_obj["role"].lower()
            if role_filter in ("user", "student"):
                if u_role not in ("user", "student"):
                    continue
            elif u_role != role_filter:
                continue

        if search:
            combined = f"{user_obj['name']} {user_obj['email']} {user_obj['regNo']} {user_obj['phone']} {user_obj['branch']}".lower()
            if search not in combined:
                continue

        users.append(user_obj)

    users.sort(key=lambda u: str(u.get("createdAt") or ""), reverse=True)
    return jsonify(users=users, total=len(users))

@admin_routes.get("/api/admin/users/<user_id>")
@require_admin
def get_admin_user_details(user_id):
    """Get single user profile details."""
    db = get_db()
    doc = db.collection("users").document(user_id).get()
    if not doc.exists:
        return jsonify(error="User not found"), 404

    data = doc.to_dict()
    data["id"] = doc.id
    return jsonify(user=data)

@admin_routes.put("/api/admin/users/<user_id>")
@require_admin
def update_admin_user(user_id):
    """Admin update user profile fields, role, or status."""
    db = get_db()
    ref = db.collection("users").document(user_id)
    doc = ref.get()
    if not doc.exists:
        return jsonify(error="User not found"), 404

    body = request.get_json(silent=True) or {}
    allowed = ["name", "email", "role", "status", "regNo", "branch", "year", "semester", "phone", "photoUrl", "profileCompleted"]
    updates = {}
    for k in allowed:
        if k in body:
            updates[k] = body[k]

    if not updates:
        return jsonify(error="No update data provided"), 400

    updates["updatedAt"] = firestore.SERVER_TIMESTAMP
    ref.update(updates)

    # Sync status with Firebase Auth if status changed
    if "status" in updates:
        try:
            admin_auth = get_admin_auth()
            is_disabled = (updates["status"] == "blocked")
            admin_auth.update_user(user_id, disabled=is_disabled)
        except Exception:
            pass

    updated_data = ref.get().to_dict()
    updated_data["id"] = user_id
    return jsonify(message="User updated successfully", user=updated_data)

@admin_routes.delete("/api/admin/users/<user_id>")
@require_admin
def delete_admin_user(user_id):
    """Permanently delete user from Firestore and Firebase Auth."""
    db = get_db()
    ref = db.collection("users").document(user_id)
    if not ref.get().exists:
        return jsonify(error="User not found"), 404

    # Delete subcollections if any
    ref.delete()

    try:
        admin_auth = get_admin_auth()
        admin_auth.delete_user(user_id)
    except Exception as exc:
        print(f"Warning: could not delete auth account {user_id}: {exc}")

    return jsonify(message="User deleted permanently", id=user_id)

@admin_routes.post("/api/admin/users/<user_id>/block")
@require_admin
def toggle_block_user(user_id):
    """Toggle user active / blocked status."""
    db = get_db()
    ref = db.collection("users").document(user_id)
    doc = ref.get()
    if not doc.exists:
        return jsonify(error="User not found"), 404

    current_status = doc.to_dict().get("status", "active")
    new_status = "blocked" if current_status != "blocked" else "active"
    ref.update({"status": new_status, "updatedAt": firestore.SERVER_TIMESTAMP})

    try:
        admin_auth = get_admin_auth()
        admin_auth.update_user(user_id, disabled=(new_status == "blocked"))
    except Exception:
        pass

    return jsonify(id=user_id, status=new_status, blocked=(new_status == "blocked"))

@admin_routes.post("/api/admin/students")
@require_admin
def create_student_admin():
    """Admin endpoint to create a student account directly."""
    body = request.get_json(silent=True) or {}
    email = (body.get("email") or "").strip().lower()
    name = (body.get("name") or "").strip()
    password = body.get("password") or "SkillHub@123"
    branch = (body.get("branch") or "").strip()

    if not email or not name:
        return jsonify(error="Name and email are required"), 400

    admin_auth = get_admin_auth()
    db = get_db()

    try:
        user_record = admin_auth.create_user(
            email=email,
            password=password,
            display_name=name,
            email_verified=True
        )
    except Exception as exc:
        return jsonify(error=f"Auth creation failed: {exc}"), 400

    uid = user_record.uid
    profile = {
        "name": name,
        "email": email,
        "role": "user",
        "branch": branch,
        "status": "active",
        "profileCompleted": False,
        "regNo": body.get("regNo", ""),
        "year": body.get("year", ""),
        "semester": body.get("semester", ""),
        "phone": body.get("phone", ""),
        "photoUrl": "",
        "createdAt": firestore.SERVER_TIMESTAMP
    }
    db.collection("users").document(uid).set(profile)
    profile_out = {**profile, "createdAt": int(time.time())}
    return jsonify(message="Student created successfully", id=uid, user={"id": uid, **profile_out}), 201

@admin_routes.post("/api/admin/instructors")
@require_admin
def create_instructor_admin():
    """Admin endpoint to create an instructor account."""
    body = request.get_json(silent=True) or {}
    email = (body.get("email") or "").strip().lower()
    name = (body.get("name") or "").strip()
    password = body.get("password") or "SkillHub@123"

    if not email or not name:
        return jsonify(error="Name and email are required"), 400

    admin_auth = get_admin_auth()
    db = get_db()

    try:
        user_record = admin_auth.create_user(
            email=email,
            password=password,
            display_name=name,
            email_verified=True
        )
    except Exception as exc:
        return jsonify(error=f"Auth creation failed: {exc}"), 400

    uid = user_record.uid
    profile = {
        "name": name,
        "email": email,
        "role": "instructor",
        "status": "active",
        "profileCompleted": True,
        "createdAt": firestore.SERVER_TIMESTAMP
    }
    db.collection("users").document(uid).set(profile)
    profile_out = {**profile, "createdAt": int(time.time())}
    return jsonify(message="Instructor created successfully", id=uid, user={"id": uid, **profile_out}), 201

# ---- Courses Admin APIs ----
def _course_payload(body):
    title = (body.get("title") or "").strip()
    if not title:
        raise ValueError("Course title is required")
    return {
        "title": title,
        "category": body.get("category") or "Programming",
        "instructor": body.get("instructor") or "Unassigned",
        "hours": int(body.get("hours") or 0),
        "icon": body.get("icon") or "📘",
        "thumbnailUrl": body.get("thumbnailUrl") or "",
        "status": body.get("status") or "published",
    }

@admin_routes.get("/api/admin/courses")
@require_admin
def list_admin_courses():
    db = get_db()
    courses = []
    for snapshot in db.collection("courses").stream():
        courses.append({"id": snapshot.id, **snapshot.to_dict()})
    courses.sort(key=lambda item: str(item.get("createdAt") or ""), reverse=True)
    return jsonify(courses=courses)

@admin_routes.post("/api/admin/courses")
@require_admin
def create_admin_course():
    try:
        payload = _course_payload(request.get_json(silent=True) or {})
    except (TypeError, ValueError) as exc:
        return jsonify(error=str(exc)), 400
    db = get_db()
    payload["createdAt"] = firestore.SERVER_TIMESTAMP
    ref = db.collection("courses").document()
    ref.set(payload)
    return jsonify(course={"id": ref.id, **{k: v for k, v in payload.items() if k != "createdAt"}}), 201

@admin_routes.patch("/api/admin/courses/<course_id>")
@require_admin
def update_admin_course(course_id):
    body = request.get_json(silent=True) or {}
    allowed = {"title", "category", "instructor", "hours", "icon", "thumbnailUrl", "status"}
    updates = {k: v for k, v in body.items() if k in allowed}
    if "title" in updates:
        updates["title"] = updates["title"].strip()
        if not updates["title"]:
            return jsonify(error="Course title is required"), 400
    if "hours" in updates:
        updates["hours"] = int(updates["hours"] or 0)
    if not updates:
        return jsonify(error="No course changes supplied"), 400

    db = get_db()
    ref = db.collection("courses").document(course_id)
    if not ref.get().exists:
        return jsonify(error="Course not found"), 404
    ref.update(updates)
    return jsonify(id=course_id, updated=True)

@admin_routes.delete("/api/admin/courses/<course_id>")
@require_admin
def delete_admin_course(course_id):
    db = get_db()
    ref = db.collection("courses").document(course_id)
    if not ref.get().exists:
        return jsonify(error="Course not found"), 404
    ref.delete()
    return jsonify(id=course_id, deleted=True)

# ---- Video uploads ----
@admin_routes.post("/api/admin/videos/upload")
@require_admin
def upload_video():
    if "file" not in request.files:
        return jsonify(error="No video file attached"), 400
    file = request.files["file"]
    if file.filename == "":
        return jsonify(error="Empty file"), 400

    safe_name = f"{int(time.time())}_{secure_filename(file.filename)}"
    dest = os.path.join(VIDEOS_DIR, safe_name)
    file.save(dest)

    title = request.form.get("title", file.filename)
    section = request.form.get("section", "General")
    branch = request.form.get("branch", "")
    description = request.form.get("description", "")

    db = get_db()
    record = {
        "title": title,
        "section": section,
        "branch": branch,
        "description": description,
        "videoUrl": f"/uploads/videos/{safe_name}",
        "uploadedAt": firestore.SERVER_TIMESTAMP
    }
    doc_ref = db.collection("library_videos").document()
    doc_ref.set(record)

    return jsonify({"id": doc_ref.id, **record}), 201

@admin_routes.delete("/api/admin/videos/<video_id>")
@require_admin
def delete_video(video_id):
    db = get_db()
    ref = db.collection("library_videos").document(video_id)
    doc = ref.get()
    if not doc.exists:
        return jsonify(error="Video not found"), 404

    data = doc.to_dict()
    video_url = data.get("videoUrl", "")
    if video_url.startswith("/uploads/videos/"):
        filename = video_url.replace("/uploads/videos/", "")
        local_path = os.path.join(VIDEOS_DIR, filename)
        if os.path.exists(local_path):
            try:
                os.remove(local_path)
            except Exception:
                pass
    ref.delete()
    return jsonify(id=video_id, deleted=True)

@admin_routes.post("/api/admin/announcements")
@require_admin
def publish_announcement():
    """Publish an announcement as Administrator using Firebase Admin SDK."""
    data = request.get_json(silent=True) or {}
    title = (data.get("title") or "").strip()
    body = (data.get("body") or "").strip()
    audience = (data.get("audience") or "All Students").strip()

    if not title or not body:
        return jsonify(error="Title and announcement message body are required"), 400

    db = get_db()
    record = {
        "title": title,
        "body": body,
        "audience": audience,
        "author": "SkillHub Administration",
        "type": "admin_notice",
        "createdAt": firestore.SERVER_TIMESTAMP,
    }
    doc_ref = db.collection("announcements").document()
    doc_ref.set(record)

    return jsonify({
        "id": doc_ref.id,
        "title": title,
        "body": body,
        "audience": audience,
        "author": "SkillHub Administration",
        "message": "Announcement broadcasted successfully",
        "success": True
    }), 201

@admin_routes.delete("/api/admin/announcements/<ann_id>")
@require_admin
def delete_announcement(ann_id):
    """Delete an announcement as Administrator."""
    db = get_db()
    db.collection("announcements").document(ann_id).delete()
    return jsonify(id=ann_id, deleted=True, success=True)

