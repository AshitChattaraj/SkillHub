import os
from dotenv import load_dotenv

load_dotenv()

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(BASE_DIR)

SERVICE_ACCOUNT_ENV = os.environ.get("FIREBASE_SERVICE_ACCOUNT_KEY", "serviceAccountKey.json")
if os.path.isabs(SERVICE_ACCOUNT_ENV) and os.path.exists(SERVICE_ACCOUNT_ENV):
    SERVICE_ACCOUNT_PATH = SERVICE_ACCOUNT_ENV
else:
    candidate_1 = os.path.abspath(os.path.join(ROOT_DIR, SERVICE_ACCOUNT_ENV))
    candidate_2 = os.path.abspath(os.path.join(BASE_DIR, SERVICE_ACCOUNT_ENV))
    candidate_3 = os.path.join(ROOT_DIR, "serviceAccountKey.json")
    if os.path.exists(candidate_1):
        SERVICE_ACCOUNT_PATH = candidate_1
    elif os.path.exists(candidate_2):
        SERVICE_ACCOUNT_PATH = candidate_2
    else:
        SERVICE_ACCOUNT_PATH = candidate_3

FIREBASE_PROJECT_ID = os.environ.get("FIREBASE_PROJECT_ID", "skill-hub-df744")
FIREBASE_WEB_API_KEY = os.environ.get("FIREBASE_WEB_API_KEY", "AIzaSyCJgr1ZLZkonX0yji2PYjK4rb3bP3v06qU")

PORT = int(os.environ.get("PORT", "5000"))
DEBUG = os.environ.get("DEBUG", "False").lower() in ("true", "1")

# Deployment URLs / CORS
USER_APP_URL = os.environ.get("USER_APP_URL", "http://localhost:5001")
ADMIN_APP_URL = os.environ.get("ADMIN_APP_URL", "http://localhost:5002")
FRONTEND_ORIGINS = os.environ.get(
    "FRONTEND_ORIGINS",
    f"{USER_APP_URL},{ADMIN_APP_URL},http://localhost:5001,http://localhost:5002,http://127.0.0.1:5001,http://127.0.0.1:5002,http://localhost:5500,http://127.0.0.1:5500,http://localhost:8000,http://127.0.0.1:8000,http://localhost:3000,http://localhost:5173"
)

UPLOADS_DIR = os.path.join(BASE_DIR, "uploads")
AVATARS_DIR = os.path.join(UPLOADS_DIR, "avatars")
VIDEOS_DIR = os.path.join(UPLOADS_DIR, "videos")

os.makedirs(AVATARS_DIR, exist_ok=True)
os.makedirs(VIDEOS_DIR, exist_ok=True)

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-1.5-flash")
