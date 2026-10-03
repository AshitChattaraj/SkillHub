import os
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
from config import (
    PORT, DEBUG, FRONTEND_ORIGINS, UPLOADS_DIR, AVATARS_DIR, VIDEOS_DIR,
    FIREBASE_PROJECT_ID
)
from database import init_firebase
from routes.auth_routes import auth_routes
from routes.user_routes import user_routes
from routes.admin_routes import admin_routes

# Initialize Firebase on startup
init_firebase()

app = Flask(__name__)

# Determine allowed origins
allowed_origins = [o.strip() for o in FRONTEND_ORIGINS.split(",") if o.strip()]

def add_cors_headers(response):
    origin = request.headers.get("Origin")
    if origin:
        is_dev = origin.startswith("http://localhost:") or origin.startswith("http://127.0.0.1:")
        if is_dev or "*" in allowed_origins or origin in allowed_origins:
            response.headers["Access-Control-Allow-Origin"] = origin
            response.headers["Access-Control-Allow-Headers"] = "Authorization, Content-Type, Accept, X-Requested-With"
            response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, PATCH, DELETE, OPTIONS"
            response.headers["Access-Control-Allow-Credentials"] = "true"
    elif not origin and "*" in allowed_origins:
        response.headers["Access-Control-Allow-Origin"] = "*"
    return response

app.after_request(add_cors_headers)

@app.route("/api/<path:subpath>", methods=["OPTIONS"])
def handle_options(subpath):
    return "", 204

# Register Blueprints
app.register_blueprint(auth_routes)
app.register_blueprint(user_routes)
app.register_blueprint(admin_routes)

# Static file serving for uploads
@app.get("/uploads/avatars/<path:filename>")
def serve_avatar(filename):
    return send_from_directory(AVATARS_DIR, filename)

@app.get("/uploads/videos/<path:filename>")
def serve_video(filename):
    return send_from_directory(VIDEOS_DIR, filename)

@app.get("/api/health")
def health_check():
    return jsonify({
        "status": "healthy",
        "service": "SkillHub Shared Backend API",
        "firebaseProjectId": FIREBASE_PROJECT_ID,
        "allowedOrigins": allowed_origins
    })

@app.errorhandler(404)
def handle_404(e):
    if request.path.startswith("/api/"):
        return jsonify(error="API route not found"), 404
    return jsonify(error="Not found"), 404

@app.errorhandler(500)
def handle_500(e):
    return jsonify(error="Internal server error", details=str(e)), 500

if __name__ == "__main__":
    print(f"SkillHub Shared Backend running on http://0.0.0.0:{PORT}")
    print(f"Allowed Frontend Origins: {allowed_origins}")
    app.run(host="0.0.0.0", port=PORT, debug=DEBUG)
