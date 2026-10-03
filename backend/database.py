import os
import firebase_admin
from firebase_admin import credentials, firestore, auth as admin_auth
from config import SERVICE_ACCOUNT_PATH, FIREBASE_PROJECT_ID

_app = None
_db = None

def init_firebase():
    global _app, _db
    if not firebase_admin._apps:
        if os.path.exists(SERVICE_ACCOUNT_PATH):
            cred = credentials.Certificate(SERVICE_ACCOUNT_PATH)
            _app = firebase_admin.initialize_app(cred)
        else:
            # Fallback to application default credentials if path not found
            _app = firebase_admin.initialize_app()
    else:
        _app = firebase_admin.get_app()
    _db = firestore.client()
    return _db

def get_db():
    global _db
    if _db is None:
        init_firebase()
    return _db

def get_admin_auth():
    if not firebase_admin._apps:
        init_firebase()
    return admin_auth
