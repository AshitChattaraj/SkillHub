# SkillHub Architecture & Deployment Guide

SkillHub Pro is organized into two specialized frontend applications connected to a single unified backend and shared Firebase Firestore database.

## 🚀 Live GitHub Pages Deployment

The project is configured for automated deployment via GitHub Pages and GitHub Actions:

* **Platform Gateway (Hub)**: `https://ashitchattaraj.github.io/SkillHub/`
* **Student Learning Portal**: `https://ashitchattaraj.github.io/SkillHub/user-panel/frontend/index.html`
* **Administrator SaaS Portal**: `https://ashitchattaraj.github.io/SkillHub/admin-panel/frontend/index.html`

Both portals connect to the live Cloud Firestore database (`skill-hub-df744`) directly from the browser, allowing full student registration, course browsing, and admin user/course management without needing a separate hosted Python server.

### Enabling GitHub Pages in Repository Settings:
1. Navigate to your repository: `https://github.com/AshitChattaraj/SkillHub/settings/pages`
2. Under **Build and deployment** > **Source**:
   - Select **GitHub Actions** (recommended, uses the included `.github/workflows/deploy.yml` workflow)
   - *OR* select **Deploy from a branch** -> Branch: `main` -> Folder: `/ (root)`.
3. Within 1-2 minutes, your site will be live at `https://ashitchattaraj.github.io/SkillHub/`!

---


```text
SkillHub_build/
│
├── user-panel/              # Independently deployable Student Application
│   ├── frontend/
│   │   ├── index.html       # Landing page (Modern clean light theme)
│   │   ├── login.html       # Student sign-in
│   │   ├── signup.html      # Student registration (Initializes profileCompleted = false)
│   │   ├── profile-setup.html # Mandatory student onboarding profile setup
│   │   ├── dashboard.html   # Student dashboard (Courses, AI Tutor, Progress, Profile)
│   │   ├── assets/          # Light CSS, JavaScript client modules, images
│   │   └── pdfs/            # Study materials & GATE notes
│   ├── serve.py             # Local dev runner (Port 5001)
│   └── package.json
│
├── admin-panel/             # Independently deployable Administrator SaaS Application
│   ├── frontend/
│   │   ├── index.html       # Administrator portal home
│   │   ├── admin-login.html # Admin-only authentication gate
│   │   ├── admindashboard.html # SaaS dashboard with 9-column user table & modal
│   │   ├── assets/          # SaaS Light CSS, JavaScript client modules
│   │   └── uploads/         # Admin uploaded materials
│   ├── serve.py             # Local dev runner (Port 5002)
│   └── package.json
│
└── backend/                 # Shared Backend REST API & Database Integration
    ├── app.py               # Main Flask API server (Port 5000)
    ├── database.py          # Firebase Admin SDK & Firestore client initialization
    ├── auth_middleware.py   # RBAC decorators (require_auth, require_admin, require_user)
    ├── routes/
    │   ├── auth_routes.py   # POST /api/auth/signup, /api/auth/login, /api/auth/logout
    │   ├── user_routes.py   # GET/PUT /api/user/profile, POST /api/user/profile-photo, /api/ask
    │   └── admin_routes.py  # GET/PUT/DELETE /api/admin/users, courses, and video uploads
    ├── uploads/             # Profile avatars and uploaded videos
    ├── requirements.txt     # Python dependencies
    └── .env                 # Environment config (CORS origins, ports, keys)
```

---

## 1. Quick Start (Local Development)

### Start the Shared Backend (Port 5000)
```bash
# In the workspace root
.\.venv\Scripts\Activate.ps1
python backend/app.py
```
Backend runs on **http://localhost:5000**. Health check: **http://localhost:5000/api/health**.

### Start the User Panel (Port 5001)
Open a separate terminal:
```bash
python user-panel/serve.py
```
Student panel runs on **http://localhost:5001**.

### Start the Admin Panel (Port 5002)
Open a third terminal:
```bash
python admin-panel/serve.py
```
Administrator panel runs on **http://localhost:5002**.

---

## 2. Shared Backend & Data Synchronization Flow

Both frontends point to the **same backend API** and **same Firestore database**:

```text
User Panel (Port 5001)             Admin Panel (Port 5002)
        │                                    ▲
        │ HTTPS REST                         │ HTTPS REST
        ▼                                    │
┌────────────────────────────────────────────────────────┐
│               Shared Backend (Port 5000)               │
│  - Authentication & RBAC Enforcement                  │
│  - Student Profile APIs (/api/user/profile)            │
│  - Admin Management APIs (/api/admin/users)            │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼
             ┌───────────────────────────┐
             │ Firestore Shared Database │
             │ Collection: "users"       │
             │ Collection: "courses"     │
             └───────────────────────────┘
```

### User Onboarding Flow
1. **Student Signs Up**: `user-panel/frontend/signup.html` calls `createUserProfile()` creating user in Firestore with `profileCompleted: false` and `role: "user"`.
2. **Mandatory Profile Setup**: User is immediately redirected to `profile-setup.html`. Access to `dashboard.html` is blocked until profile completion.
3. **Save Profile**: Student submits photo, registration number, branch, year, semester, and mobile number. Backend validates and sets `profileCompleted: true`.
4. **Instant Admin Sync**: The user is immediately visible in the Admin Panel table with all academic fields, photo, and completion status.

---

## 3. Clean REST API Specification

### Authentication APIs
* `POST /api/auth/signup` — Create user account (`role="user"`, `profileCompleted=false`).
* `POST /api/auth/login` — Sign in with email and password via Firebase REST API.
* `POST /api/auth/logout` — Invalidate session.
* `GET /api/auth/me` — Return current authenticated user profile.

### Student / User APIs
* `GET /api/user/profile` — Fetch current user's profile details.
* `PUT /api/user/profile` — Update name, regNo, branch, year, semester, mobile. Sets `profileCompleted=true` once filled.
* `POST /api/user/profile-photo` — Secure multipart image upload for profile avatar.
* `GET /api/courses` — List published courses.
* `POST /api/ask` — AI Tutor query proxy to Gemini.

### Administrator APIs (Requires `role="admin"`, non-admins receive `403 Forbidden`)
* `GET /api/admin/users` — List all registered users (supports `search`, `branch`, `year`, `semester`, `status` query filters).
* `GET /api/admin/users/<id>` — Return complete user profile details.
* `PUT /api/admin/users/<id>` — Admin update user details, role, or status.
* `DELETE /api/admin/users/<id>` — Delete user account from Firestore and Firebase Auth.
* `POST /api/admin/users/<id>/block` — Toggle active / blocked account status.
* `GET /api/admin/courses` — List all courses (draft & published).
* `POST /api/admin/courses` — Create a new course.
* `PATCH /api/admin/courses/<id>` — Update course.
* `DELETE /api/admin/courses/<id>` — Delete course.
* `POST /api/admin/videos/upload` — Multipart video file upload.

---

## 4. Admin User Table (Requirement 9)

The Admin Dashboard provides the 9-column user table:

| Photo | Name | Registration No. | Branch | Year | Semester | Mobile | Status | Action |
| :---: | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| Avatar | Rahul Sharma | 2023CS1084 | CSE | 2nd Year | Sem 3 | 9876543210 | Active / Complete | **View Details**, Edit, Block, Delete |

* Clicking **View Details** opens an interactive profile sheet showing full user information, registration details, profile completion status, and account creation date.

---

## 5. Modern Professional Light Theme

Both panels have been upgraded from the dark palette to modern light styling:
* **Background**: Clean `#F8FAFC`
* **Cards & Surfaces**: Pure White `#FFFFFF` with borders `#E2E8F0` and subtle elevation shadows.
* **Primary Accent**: Indigo/Purple (`#6366F1` / `#7C3AED`)
* **Typography**: Plus Jakarta Sans & Inter
* **User Panel**: Student portal card layout with high-contrast text and smooth micro-interactions.
* **Admin Panel**: Professional SaaS layout with white sidebar, status badges, multi-filters, and clean tables.
